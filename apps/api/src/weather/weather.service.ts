// ============================================================
// WeatherService — Obtiene la predicción meteorológica para
// la fecha y ubicación de un evento usando WeatherAPI.com.
//
// Estrategia de API:
//   - Evento ≤ 14 días: Forecast API (/v1/forecast.json)
//   - Evento pasado:    History  API (/v1/history.json)
//   - Evento > 14 días: retorna { available: false, reason: "..." }
//   - Sin API key:      retorna null sin error
//
// Caché Redis por zona (lat/lon redondeado a 2 decimales) y fecha:
//   TTL: > 7 días = 12h | 3-7 días = 6h | 1-3 días = 2h | < 24h = 30min
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';

interface WeatherApiCurrentBlock {
  last_updated: string;
  temp_c: number;
  feelslike_c: number;
  is_day: number;
  condition: { text: string; icon: string; code: number };
  wind_kph: number;
  humidity: number;
  cloud: number;
  precip_mm: number;
  uv: number;
}

interface WeatherApiResponse {
  location: { name: string; region: string; country: string; localtime: string };
  // forecast.json devuelve también el bloque `current`, lo que permite
  // resolver clima actual y previsión del día con una única llamada.
  current?: WeatherApiCurrentBlock;
  forecast: {
    forecastday: Array<{
      date: string;
      day: {
        condition: { text: string; icon: string; code: number };
        maxtemp_c: number; mintemp_c: number; avgtemp_c: number;
        maxwind_kph: number;
        daily_chance_of_rain: number; daily_chance_of_snow: number;
        daily_will_it_rain: number;  daily_will_it_snow: number;
        totalprecip_mm: number; avghumidity: number; uv: number;
      };
      astro: { sunrise: string; sunset: string };
    }>;
  };
}

// Ubicación a consultar: coordenadas GPS o texto libre ("Lille", "Lille, FR").
export type WeatherLocation = { lat: number; lon: number } | { q: string };

const CURRENT_CACHE_TTL = 60 * 10;   // El clima actual cambia rápido: 10 min
const DAILY_CACHE_TTL = 60 * 60;     // Previsión multi-día: 1 h
const MAX_FORECAST_DAYS = 14;        // Límite del plan gratuito de WeatherAPI

interface WeatherApiCurrentResponse {
  location: { name: string; region: string; country: string; localtime: string };
  current: WeatherApiCurrentBlock;
}

export interface CurrentWeather {
  location: string;          // "Lille, Hauts-de-France, France"
  localTime: string;         // Hora local del lugar consultado
  isDay: boolean;
  conditionText: string;
  conditionIcon: string;
  conditionCode: number;
  tempC: number;
  feelsLikeC: number;
  windKph: number;
  humidity: number;
  cloud: number;
  precipMm: number;
  uvIndex: number;
  observedAt: string;        // ISO 8601
}

export interface WeatherForecast {
  available: boolean;
  reason?: string;           // Mensaje si no hay datos disponibles
  date: string;              // YYYY-MM-DD
  location: string;          // "Montreal, Quebec, Canada"
  conditionText: string;     // "Partly cloudy"
  conditionIcon: string;     // URL del icono (https://...)
  conditionCode: number;
  maxTempC: number;
  minTempC: number;
  avgTempC: number;
  maxWindKph: number;
  chanceOfRain: number;      // Porcentaje 0-100
  chanceOfSnow: number;
  willItRain: boolean;
  willItSnow: boolean;
  totalPrecipMm: number;
  avgHumidity: number;
  uvIndex: number;
  sunrise: string;
  sunset: string;
  cachedAt: string;          // ISO 8601 de cuando se cacheó
  source: 'forecast' | 'history' | 'unavailable';
}

@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);
  private readonly WEATHER_BASE = 'https://api.weatherapi.com/v1';

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  // ─── API pública ─────────────────────────────────────────────

  async getForecast(
    lat: number,
    lon: number,
    eventDate: Date,
  ): Promise<WeatherForecast | null> {
    const apiKey = this.config.get<string>('WEATHER_API_KEY');
    if (!apiKey) {
      this.logger.debug('WEATHER_API_KEY no configurado — clima desactivado');
      return null;
    }

    const dateStr = this.toDateString(eventDate);
    const cacheKey = `weather:${lat.toFixed(2)}:${lon.toFixed(2)}:${dateStr}`;

    // Intentar desde caché primero
    try {
      const cached = await this.redis.getClient().get(cacheKey);
      if (cached) return JSON.parse(cached) as WeatherForecast;
    } catch {
      this.logger.debug('Redis unavailable, bypassing weather cache read');
      // Redis down → ignorar caché, ir a la API
    }

    const now = new Date();
    const daysUntilEvent = Math.floor(
      (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );

    let forecast: WeatherForecast;

    try {
      if (daysUntilEvent > 14) {
        forecast = {
          available: false,
          reason: `Les prévisions seront disponibles à partir du ${this.addDays(eventDate, -14).toLocaleDateString('fr-FR')}`,
          date: dateStr,
          location: '',
          conditionText: '',
          conditionIcon: '',
          conditionCode: 0,
          maxTempC: 0, minTempC: 0, avgTempC: 0,
          maxWindKph: 0, chanceOfRain: 0, chanceOfSnow: 0,
          willItRain: false, willItSnow: false,
          totalPrecipMm: 0, avgHumidity: 0, uvIndex: 0,
          sunrise: '', sunset: '',
          cachedAt: now.toISOString(),
          source: 'unavailable',
        };
      } else if (daysUntilEvent < 0) {
        forecast = await this.fetchHistory(apiKey, lat, lon, dateStr, now);
      } else {
        forecast = await this.fetchForecast(apiKey, lat, lon, dateStr, now);
      }

      // Guardar en caché con TTL inteligente
      const ttl = this.getTtlSeconds(daysUntilEvent);
      try {
        await this.redis.getClient().setex(cacheKey, ttl, JSON.stringify(forecast));
      } catch {
        this.logger.debug('Redis unavailable, weather forecast not cached');
        // Redis down → continuar sin caché
      }

      return forecast;
    } catch (err) {
      this.logger.warn(`WeatherAPI error para ${lat},${lon} el ${dateStr}: ${err.message}`);
      return null;
    }
  }

  // ─── Clima actual en una ubicación arbitraria ────────────────
  // Usado por el dashboard: "¿qué tiempo hace ahora mismo?".
  // location puede ser coordenadas o un texto ("Lille", "Lille, FR").
  async getCurrent(location: WeatherLocation): Promise<CurrentWeather | null> {
    const apiKey = this.config.get<string>('WEATHER_API_KEY');
    if (!apiKey) {
      this.logger.debug('WEATHER_API_KEY no configurado — clima desactivado');
      return null;
    }

    const q = this.toQueryParam(location);
    const cacheKey = `weather:current:${this.toCacheKey(location)}`;

    try {
      const cached = await this.redis.getClient().get(cacheKey);
      if (cached) return JSON.parse(cached) as CurrentWeather;
    } catch {
      this.logger.debug('Redis unavailable, bypassing current weather cache read');
    }

    try {
      const url = `${this.WEATHER_BASE}/current.json?key=${apiKey}&q=${encodeURIComponent(q)}&aqi=no&lang=fr`;
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`WeatherAPI current ${res.status}: ${body}`);
      }

      const data = (await res.json()) as WeatherApiCurrentResponse;
      const current = this.mapCurrent(data.location, data.current);

      try {
        await this.redis.getClient().setex(cacheKey, CURRENT_CACHE_TTL, JSON.stringify(current));
      } catch {
        this.logger.debug('Redis unavailable, current weather not cached');
      }

      return current;
    } catch (err) {
      this.logger.warn(`WeatherAPI current error para ${q}: ${(err as Error).message}`);
      return null;
    }
  }

  // ─── Clima actual + previsión de hoy en UNA sola llamada ─────
  // forecast.json incluye el bloque `current`, así que el dashboard
  // consume una petición de cuota en vez de dos.
  async getCurrentAndToday(
    location: WeatherLocation,
  ): Promise<{ current: CurrentWeather | null; today: WeatherForecast | null }> {
    const apiKey = this.config.get<string>('WEATHER_API_KEY');
    if (!apiKey) {
      this.logger.debug('WEATHER_API_KEY no configurado — clima desactivado');
      return { current: null, today: null };
    }

    const q = this.toQueryParam(location);
    const locationKey = this.toCacheKey(location);
    const currentKey = `weather:current:${locationKey}`;
    const dailyKey = `weather:daily:${locationKey}:1`;

    try {
      const client = this.redis.getClient();
      const [cachedCurrent, cachedDaily] = await client.mget(currentKey, dailyKey);
      if (cachedCurrent && cachedDaily) {
        return {
          current: JSON.parse(cachedCurrent) as CurrentWeather,
          today: (JSON.parse(cachedDaily) as WeatherForecast[])[0] ?? null,
        };
      }
    } catch {
      this.logger.debug('Redis unavailable, bypassing dashboard weather cache read');
    }

    try {
      const now = new Date();
      const url = `${this.WEATHER_BASE}/forecast.json?key=${apiKey}&q=${encodeURIComponent(q)}&days=1&aqi=no&alerts=no&lang=fr`;
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`WeatherAPI forecast ${res.status}: ${body}`);
      }

      const data = (await res.json()) as WeatherApiResponse;
      const today = this.mapForecastDay(data, 'forecast', now);
      const current = data.current ? this.mapCurrent(data.location, data.current) : null;

      try {
        const client = this.redis.getClient();
        await client.setex(dailyKey, DAILY_CACHE_TTL, JSON.stringify([today]));
        if (current) {
          await client.setex(currentKey, CURRENT_CACHE_TTL, JSON.stringify(current));
        }
      } catch {
        this.logger.debug('Redis unavailable, dashboard weather not cached');
      }

      return { current, today };
    } catch (err) {
      this.logger.warn(`WeatherAPI dashboard error para ${q}: ${(err as Error).message}`);
      return { current: null, today: null };
    }
  }

  // ─── Previsión de varios días consecutivos ───────────────────
  // WeatherAPI devuelve hasta 14 días en el plan gratuito.
  async getDailyForecast(
    location: WeatherLocation,
    days: number,
  ): Promise<WeatherForecast[] | null> {
    const apiKey = this.config.get<string>('WEATHER_API_KEY');
    if (!apiKey) {
      this.logger.debug('WEATHER_API_KEY no configurado — clima desactivado');
      return null;
    }

    const clampedDays = Math.min(Math.max(days, 1), MAX_FORECAST_DAYS);
    const q = this.toQueryParam(location);
    const cacheKey = `weather:daily:${this.toCacheKey(location)}:${clampedDays}`;

    try {
      const cached = await this.redis.getClient().get(cacheKey);
      if (cached) return JSON.parse(cached) as WeatherForecast[];
    } catch {
      this.logger.debug('Redis unavailable, bypassing daily forecast cache read');
    }

    try {
      const now = new Date();
      const url = `${this.WEATHER_BASE}/forecast.json?key=${apiKey}&q=${encodeURIComponent(q)}&days=${clampedDays}&aqi=no&alerts=no&lang=fr`;
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`WeatherAPI forecast ${res.status}: ${body}`);
      }

      const data = (await res.json()) as WeatherApiResponse;
      const forecasts = data.forecast.forecastday.map((_, index) =>
        this.mapForecastDay(data, 'forecast', now, index),
      );

      try {
        await this.redis.getClient().setex(cacheKey, DAILY_CACHE_TTL, JSON.stringify(forecasts));
      } catch {
        this.logger.debug('Redis unavailable, daily forecast not cached');
      }

      return forecasts;
    } catch (err) {
      this.logger.warn(`WeatherAPI forecast error para ${q}: ${(err as Error).message}`);
      return null;
    }
  }

  // ─── Métodos privados ─────────────────────────────────────────

  private mapCurrent(
    loc: { name: string; region: string; country: string; localtime: string },
    c: WeatherApiCurrentBlock,
  ): CurrentWeather {
    return {
      location: `${loc.name}, ${loc.region}, ${loc.country}`,
      localTime: loc.localtime,
      isDay: c.is_day === 1,
      conditionText: c.condition.text,
      conditionIcon: `https:${c.condition.icon}`,
      conditionCode: c.condition.code,
      tempC: c.temp_c,
      feelsLikeC: c.feelslike_c,
      windKph: c.wind_kph,
      humidity: c.humidity,
      cloud: c.cloud,
      precipMm: c.precip_mm,
      uvIndex: c.uv,
      observedAt: new Date().toISOString(),
    };
  }

  private toQueryParam(location: WeatherLocation): string {
    return 'q' in location ? location.q : `${location.lat},${location.lon}`;
  }

  // Las coordenadas se redondean a 2 decimales (~1 km) para que usuarios
  // cercanos compartan la misma entrada de caché.
  private toCacheKey(location: WeatherLocation): string {
    return 'q' in location
      ? location.q.trim().toLowerCase()
      : `${location.lat.toFixed(2)}:${location.lon.toFixed(2)}`;
  }

  private async fetchForecast(
    apiKey: string,
    lat: number,
    lon: number,
    dateStr: string,
    now: Date,
  ): Promise<WeatherForecast> {
    const url = `${this.WEATHER_BASE}/forecast.json?key=${apiKey}&q=${lat},${lon}&dt=${dateStr}&days=1&aqi=no&alerts=no&lang=fr`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`WeatherAPI ${res.status}: ${body}`);
    }
    const data = await res.json() as WeatherApiResponse;
    return this.mapForecastDay(data, 'forecast', now);
  }

  private async fetchHistory(
    apiKey: string,
    lat: number,
    lon: number,
    dateStr: string,
    now: Date,
  ): Promise<WeatherForecast> {
    const url = `${this.WEATHER_BASE}/history.json?key=${apiKey}&q=${lat},${lon}&dt=${dateStr}&aqi=no&lang=fr`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`WeatherAPI history ${res.status}: ${body}`);
    }
    const data = await res.json() as WeatherApiResponse;
    return this.mapForecastDay(data, 'history', now);
  }

  private mapForecastDay(
    data: WeatherApiResponse,
    source: 'forecast' | 'history',
    now: Date,
    dayIndex = 0,
  ): WeatherForecast {
    const loc = data.location;
    const day = data.forecast.forecastday[dayIndex];
    const d = day.day;
    const astro = day.astro;

    return {
      available: true,
      date: day.date,
      location: `${loc.name}, ${loc.region}, ${loc.country}`,
      conditionText: d.condition.text,
      conditionIcon: `https:${d.condition.icon}`,
      conditionCode: d.condition.code,
      maxTempC: d.maxtemp_c,
      minTempC: d.mintemp_c,
      avgTempC: d.avgtemp_c,
      maxWindKph: d.maxwind_kph,
      chanceOfRain: d.daily_chance_of_rain,
      chanceOfSnow: d.daily_chance_of_snow,
      willItRain: d.daily_will_it_rain === 1,
      willItSnow: d.daily_will_it_snow === 1,
      totalPrecipMm: d.totalprecip_mm,
      avgHumidity: d.avghumidity,
      uvIndex: d.uv,
      sunrise: astro.sunrise,
      sunset: astro.sunset,
      cachedAt: now.toISOString(),
      source,
    };
  }

  private getTtlSeconds(daysUntilEvent: number): number {
    if (daysUntilEvent < 0) return 60 * 60 * 24; // Histórico: 24h
    if (daysUntilEvent < 1) return 60 * 30;       // Día del evento: 30 min
    if (daysUntilEvent < 3) return 60 * 60 * 2;   // 1-3 días: 2h
    if (daysUntilEvent < 7) return 60 * 60 * 6;   // 3-7 días: 6h
    return 60 * 60 * 12;                           // > 7 días: 12h
  }

  private toDateString(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private addDays(date: Date, days: number): Date {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }
}
