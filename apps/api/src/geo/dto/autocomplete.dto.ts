import { IsString, IsNotEmpty, IsIn } from 'class-validator';
import { SupportedCountry, SUPPORTED_COUNTRIES } from './geocode.dto';

export class AutocompleteDto {
  @IsString()
  @IsNotEmpty()
  q: string;

  @IsIn(SUPPORTED_COUNTRIES)
  country: SupportedCountry;
}

export interface AutocompleteResult {
  label: string;
  lat: number;
  lng: number;
}
