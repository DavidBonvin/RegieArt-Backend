// ============================================================
// WeatherAlertsService — Avisos meteorológicos para los próximos
// eventos del usuario.
//
// Recorre los eventos en los que participa (roster) dentro de una
// ventana de tiempo, consulta la previsión del recinto y devuelve
// solo aquellos con condiciones que exigen proteger el material.
// ============================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WeatherForecast, WeatherService } from '../weather.service';

export interface EventWeatherAlert {
  eventId: string;
  eventTitle: string;
  startTime: Date;
  venueName: string;
  city: string;
  severity: 'info' | 'warning';
  message: string;
  forecast: WeatherForecast;
}

const RAIN_CHANCE_WARNING = 40;
const STRONG_WIND_KPH = 40;
const COLD_TEMP_C = 2;
const HOT_TEMP_C = 30;

@Injectable()
export class WeatherAlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly weather: WeatherService,
  ) {}

  async getUpcomingAlerts(userId: string, hours: number): Promise<EventWeatherAlert[]> {
    const now = new Date();
    const until = new Date(now.getTime() + hours * 60 * 60 * 1000);

    const rosterEntries = await this.prisma.eventRoster.findMany({
      where: {
        userId,
        status: { not: 'DECLINED' },
        event: {
          deletedAt: null,
          status: { not: 'CANCELLED' },
          startTime: { gte: now, lte: until },
          venue: { latitude: { not: null }, longitude: { not: null } },
        },
      },
      include: { event: { include: { venue: true } } },
      orderBy: { event: { startTime: 'asc' } },
    });

    const alerts = await Promise.all(
      rosterEntries.map((entry) => this.buildAlert(entry.event)),
    );

    return alerts.filter((alert): alert is EventWeatherAlert => alert !== null);
  }

  private async buildAlert(
    event: { id: string; title: string; startTime: Date; venue: { name: string; city: string; latitude: number | null; longitude: number | null } | null },
  ): Promise<EventWeatherAlert | null> {
    const venue = event.venue;
    if (!venue?.latitude || !venue?.longitude) return null;

    const forecast = await this.weather.getForecast(venue.latitude, venue.longitude, event.startTime);
    if (!forecast?.available) return null;

    const assessment = this.assess(forecast);
    if (!assessment) return null;

    return {
      eventId: event.id,
      eventTitle: event.title,
      startTime: event.startTime,
      venueName: venue.name,
      city: venue.city,
      severity: assessment.severity,
      message: assessment.message,
      forecast,
    };
  }

  private assess(f: WeatherForecast): { severity: 'info' | 'warning'; message: string } | null {
    if (f.willItSnow || f.chanceOfSnow >= RAIN_CHANCE_WARNING) {
      return {
        severity: 'warning',
        message: `Neige annoncée (${f.chanceOfSnow} %). Prévoyez des housses et du temps pour le transport.`,
      };
    }

    if (f.willItRain || f.chanceOfRain >= RAIN_CHANCE_WARNING) {
      return {
        severity: 'warning',
        message: `Risque de pluie (${f.chanceOfRain} %). Protégez vos instruments et le matériel technique.`,
      };
    }

    if (f.maxWindKph >= STRONG_WIND_KPH) {
      return {
        severity: 'warning',
        message: `Vent fort prévu (${Math.round(f.maxWindKph)} km/h). Sécurisez les structures et les pieds de micro.`,
      };
    }

    if (f.minTempC <= COLD_TEMP_C) {
      return {
        severity: 'info',
        message: `Températures négatives (${Math.round(f.minTempC)} °C). Laissez les instruments s'acclimater avant la balance.`,
      };
    }

    if (f.maxTempC >= HOT_TEMP_C) {
      return {
        severity: 'info',
        message: `Forte chaleur (${Math.round(f.maxTempC)} °C). Ne laissez rien dans les véhicules et hydratez-vous.`,
      };
    }

    return null;
  }
}
