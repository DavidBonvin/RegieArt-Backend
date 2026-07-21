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
import { RedisService } from '../../redis/redis.service';

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
          reason: `La predicción estará disponible a partir del ${this.addDays(eventDate, -14).toLocaleDateString('es-ES')}`,
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
        // Redis down → continuar sin caché
      }

      return forecast;
    } catch (err) {
      this.logger.warn(`WeatherAPI error para ${lat},${lon} el ${dateStr}: ${err.message}`);
      return null;
    }
  }

  // ─── Métodos privados ─────────────────────────────────────────

  private async fetchForecast(
    apiKey: string,
    lat: number,
    lon: number,
    dateStr: string,
    now: Date,
  ): Promise<WeatherForecast> {
    const url = `${this.WEATHER_BASE}/forecast.json?key=${apiKey}&q=${lat},${lon}&dt=${dateStr}&days=1&aqi=no&alerts=no&lang=es`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`WeatherAPI ${res.status}: ${body}`);
    }
    const data: any = await res.json();
    return this.mapForecastDay(data, 'forecast', now);
  }

  private async fetchHistory(
    apiKey: string,
    lat: number,
    lon: number,
    dateStr: string,
    now: Date,
  ): Promise<WeatherForecast> {
    const url = `${this.WEATHER_BASE}/history.json?key=${apiKey}&q=${lat},${lon}&dt=${dateStr}&aqi=no&lang=es`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`WeatherAPI history ${res.status}: ${body}`);
    }
    const data: any = await res.json();
    return this.mapForecastDay(data, 'history', now);
  }

  private mapForecastDay(
    data: any,
    source: 'forecast' | 'history',
    now: Date,
  ): WeatherForecast {
    const loc = data.location;
    const day = data.forecast.forecastday[0];
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
