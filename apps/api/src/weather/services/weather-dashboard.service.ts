// ============================================================
// WeatherDashboardService — Resuelve la ubicación a consultar y
// compone la tarjeta de bienvenida del dashboard.
//
// Orden de resolución de la ubicación:
//   1. Coordenadas GPS enviadas por el cliente (móvil)
//   2. Texto libre `q` (búsqueda manual de ciudad)
//   3. Ciudad guardada en el perfil del usuario
// ============================================================

import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentWeather, WeatherForecast, WeatherLocation, WeatherService } from '../weather.service';
import { WeatherAdviceService, WeatherGreeting } from './weather-advice.service';
import { WeatherLocationQueryDto } from '../dto/weather-query.dto';

export interface WeatherDashboard {
  available: boolean;
  reason?: string;
  greeting?: WeatherGreeting;
  current?: CurrentWeather;
  today?: WeatherForecast;
}

@Injectable()
export class WeatherDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly weather: WeatherService,
    private readonly advice: WeatherAdviceService,
  ) {}

  async resolveLocation(userId: string, dto: WeatherLocationQueryDto): Promise<WeatherLocation> {
    if (dto.lat !== undefined && dto.lon !== undefined) {
      return { lat: dto.lat, lon: dto.lon };
    }

    if (dto.lat !== undefined || dto.lon !== undefined) {
      throw new BadRequestException('Les paramètres lat et lon doivent être fournis ensemble.');
    }

    if (dto.q) return { q: dto.q };

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { city: true, country: true },
    });

    if (!user?.city) {
      throw new BadRequestException(
        'Aucune position fournie et aucune ville enregistrée dans votre profil. Envoyez lat/lon ou q.',
      );
    }

    return { q: user.country ? `${user.city}, ${user.country}` : user.city };
  }

  async getDashboard(userId: string, dto: WeatherLocationQueryDto): Promise<WeatherDashboard> {
    const location = await this.resolveLocation(userId, dto);

    // Una sola llamada a WeatherAPI cubre el clima actual y la previsión del día.
    const [user, weather] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } }),
      this.weather.getCurrentAndToday(location),
    ]);

    if (!weather.current) {
      return {
        available: false,
        reason: 'Service météo indisponible pour le moment.',
      };
    }

    return {
      available: true,
      greeting: this.advice.build(user?.displayName ?? '', weather.current, weather.today),
      current: weather.current,
      today: weather.today ?? undefined,
    };
  }
}
