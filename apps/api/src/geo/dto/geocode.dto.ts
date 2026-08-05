import { IsString, IsNotEmpty, IsIn } from 'class-validator';

export type SupportedCountry = 'FR' | 'BE' | 'IT' | 'DE' | 'ES' | 'CA';
export const SUPPORTED_COUNTRIES: SupportedCountry[] = ['FR', 'BE', 'IT', 'DE', 'ES', 'CA'];

export class GeocodeDto {
  @IsString()
  @IsNotEmpty()
  address: string;

  @IsIn(SUPPORTED_COUNTRIES)
  country: SupportedCountry;
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  displayAddress: string;
  source: 'BAN' | 'nominatim';
}
