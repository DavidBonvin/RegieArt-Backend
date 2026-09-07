// ============================================================
// WeatherAdviceService — Convierte datos meteorológicos crudos
// en el mensaje de bienvenida del dashboard.
//
// Genera un saludo según la hora local del usuario y un consejo
// accionable: proteger instrumentos si hay lluvia, cuidado con el
// viento en escenarios exteriores, hidratación con calor, etc.
// ============================================================

import { Injectable } from '@nestjs/common';
import { CurrentWeather, WeatherForecast } from '../weather.service';

export type WeatherTone = 'positive' | 'neutral' | 'warning';

export interface WeatherGreeting {
  greeting: string;      // "Bonsoir, Alice"
  headline: string;      // "12 °C et ciel dégagé à Lille"
  advice: string;        // Consejo accionable
  tone: WeatherTone;
  emoji: string;
  gearWarning: boolean;  // true → el material necesita protección
}

// Rangos de códigos de condición de WeatherAPI.com
const THUNDER_CODES = [1087, 1273, 1276, 1279, 1282];
const SNOW_CODES = [1066, 1114, 1117, 1210, 1213, 1216, 1219, 1222, 1225, 1255, 1258];
const SLEET_CODES = [1069, 1072, 1204, 1207, 1237, 1249, 1252, 1261, 1264];
const RAIN_CODES = [
  1063, 1150, 1153, 1168, 1171, 1180, 1183, 1186, 1189, 1192, 1195, 1198, 1201,
  1240, 1243, 1246,
];
const FOG_CODES = [1030, 1135, 1147];
const CLEAR_CODES = [1000];

// Umbrales a partir de los cuales avisamos al usuario
const RAIN_CHANCE_WARNING = 40;   // %
const STRONG_WIND_KPH = 40;
const COLD_TEMP_C = 2;
const HOT_TEMP_C = 30;
const HIGH_UV = 8;

@Injectable()
export class WeatherAdviceService {
  build(
    displayName: string,
    current: CurrentWeather,
    today?: WeatherForecast | null,
  ): WeatherGreeting {
    const firstName = displayName.trim().split(/\s+/)[0];
    const greeting = `${this.timeGreeting(current.localTime)}, ${firstName}`;
    const city = current.location.split(',')[0].trim();
    const headline = `${Math.round(current.tempC)} °C, ${current.conditionText.toLowerCase()} à ${city}`;

    const { advice, tone, emoji, gearWarning } = this.adviceFor(current, today);

    return { greeting, headline, advice, tone, emoji, gearWarning };
  }

  // ─── Saludo según la hora local del lugar consultado ──────────
  // localTime llega como "2026-09-08 19:32"; si falla el parseo usamos la hora del servidor.
  private timeGreeting(localTime: string): string {
    const parsed = Number(localTime?.split(' ')[1]?.split(':')[0]);
    const hour = Number.isNaN(parsed) ? new Date().getHours() : parsed;

    if (hour < 6) return 'Bonne nuit';
    if (hour < 12) return 'Bonjour';
    if (hour < 18) return 'Bon après-midi';
    return 'Bonsoir';
  }

  // El orden importa: se devuelve el primer riesgo relevante encontrado.
  private adviceFor(
    current: CurrentWeather,
    today?: WeatherForecast | null,
  ): { advice: string; tone: WeatherTone; emoji: string; gearWarning: boolean } {
    const code = current.conditionCode;
    const rainChance = today?.chanceOfRain ?? 0;
    const snowChance = today?.chanceOfSnow ?? 0;
    const maxWind = Math.max(current.windKph, today?.maxWindKph ?? 0);

    if (THUNDER_CODES.includes(code)) {
      return {
        advice: 'Orages en cours. Débranchez et mettez le matériel électrique à l\'abri avant de sortir.',
        tone: 'warning',
        emoji: '⛈️',
        gearWarning: true,
      };
    }

    if (SNOW_CODES.includes(code) || snowChance >= RAIN_CHANCE_WARNING) {
      return {
        advice: 'Neige annoncée. Prévoyez des housses et laissez les instruments s\'acclimater avant de jouer.',
        tone: 'warning',
        emoji: '❄️',
        gearWarning: true,
      };
    }

    if (SLEET_CODES.includes(code)) {
      return {
        advice: 'Verglas possible. Protégez vos étuis et prévoyez plus de temps pour le transport.',
        tone: 'warning',
        emoji: '🌨️',
        gearWarning: true,
      };
    }

    if (RAIN_CODES.includes(code) || current.precipMm > 0) {
      return {
        advice: 'Il pleut. Protégez vos instruments et votre matériel si vous sortez.',
        tone: 'warning',
        emoji: '🌧️',
        gearWarning: true,
      };
    }

    if (rainChance >= RAIN_CHANCE_WARNING) {
      return {
        advice: `Risque de pluie aujourd'hui (${rainChance} %). Emportez de quoi protéger vos instruments.`,
        tone: 'warning',
        emoji: '🌦️',
        gearWarning: true,
      };
    }

    if (maxWind >= STRONG_WIND_KPH) {
      return {
        advice: `Vent fort (${Math.round(maxWind)} km/h). Attention aux pieds de micro et aux structures en extérieur.`,
        tone: 'warning',
        emoji: '💨',
        gearWarning: true,
      };
    }

    if (current.tempC <= COLD_TEMP_C) {
      return {
        advice: 'Il fait très froid. Gardez les instruments dans leur étui jusqu\'à la balance pour éviter les problèmes d\'accord.',
        tone: 'warning',
        emoji: '🥶',
        gearWarning: true,
      };
    }

    if (current.tempC >= HOT_TEMP_C) {
      return {
        advice: 'Forte chaleur. Ne laissez pas les instruments dans la voiture et pensez à vous hydrater.',
        tone: 'warning',
        emoji: '🥵',
        gearWarning: true,
      };
    }

    if (FOG_CODES.includes(code)) {
      return {
        advice: 'Brouillard sur la zone. Prévoyez de la marge pour les trajets du convoi.',
        tone: 'neutral',
        emoji: '🌫️',
        gearWarning: false,
      };
    }

    if (CLEAR_CODES.includes(code)) {
      const sunnyAdvice = current.isDay
        ? 'Belle journée ensoleillée, profitez-en !'
        : 'Ciel dégagé ce soir, parfait pour un concert en extérieur.';
      const uvAdvice =
        current.isDay && current.uvIndex >= HIGH_UV
          ? ' Indice UV élevé : pensez à la crème solaire pendant la balance.'
          : '';
      return {
        advice: sunnyAdvice + uvAdvice,
        tone: 'positive',
        emoji: current.isDay ? '☀️' : '🌙',
        gearWarning: false,
      };
    }

    return {
      advice: 'Rien à signaler côté météo. Bonne journée !',
      tone: 'neutral',
      emoji: '⛅',
      gearWarning: false,
    };
  }
}
