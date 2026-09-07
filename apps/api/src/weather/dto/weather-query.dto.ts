// ============================================================
// DTOs de consulta del módulo de clima.
// La ubicación es opcional: si no se envía, el backend usa la
// ciudad guardada en el perfil del usuario.
// ============================================================

import {
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class WeatherLocationQueryDto {
  @IsLatitude()
  @IsOptional()
  lat?: number;

  @IsLongitude()
  @IsOptional()
  lon?: number;

  // Alternativa a las coordenadas: nombre de ciudad ("Lille", "Montréal")
  @IsString()
  @MaxLength(120)
  @IsOptional()
  q?: string;
}

export class WeatherForecastQueryDto extends WeatherLocationQueryDto {
  @IsInt()
  @Min(1)
  @Max(14)
  @IsOptional()
  days?: number;
}

export class WeatherAlertsQueryDto {
  // Ventana de búsqueda de eventos, en horas (por defecto 72 h)
  @IsInt()
  @Min(1)
  @Max(336)
  @IsOptional()
  hours?: number;
}
