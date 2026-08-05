import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { GeocodeDto, GeocodeResult, SupportedCountry } from './dto/geocode.dto';
import { AutocompleteDto, AutocompleteResult } from './dto/autocomplete.dto';

// BAN API response shape (api-adresse.data.gouv.fr)
interface BanFeature {
  properties: { label: string; score: number };
  geometry: { coordinates: [number, number] }; // [lng, lat]
}
interface BanResponse {
  features: BanFeature[];
}

// Nominatim response shape
interface NominatimPlace {
  display_name: string;
  lat: string;
  lon: string;
}

const GEO_CACHE_TTL = 604800; // 7 days

@Injectable()
export class GeoService {
  private readonly logger = new Logger(GeoService.name);
  private lastNominatimCallAt = 0; // timestamp ms — enforces 1 req/sec rate limit

  constructor(private readonly redis: RedisService) {}

  // ─── Public API ───────────────────────────────────────────────

  async geocode(dto: GeocodeDto): Promise<GeocodeResult> {
    const normalized = this.normalizeAddress(dto.address);
    const cacheKey = `geo:geocode:${dto.country}:${normalized}`;

    const cached = await this.getCached<GeocodeResult>(cacheKey);
    if (cached) return cached;

    const result =
      dto.country === 'FR'
        ? await this.geocodeBAN(dto.address)
        : await this.geocodeNominatim(dto.address, dto.country);

    await this.setCache(cacheKey, result, GEO_CACHE_TTL);
    return result;
  }

  async autocomplete(dto: AutocompleteDto): Promise<AutocompleteResult[]> {
    return dto.country === 'FR'
      ? this.autocompleteBAN(dto.q)
      : this.autocompleteNominatim(dto.q, dto.country);
  }

  // ─── BAN (France) ─────────────────────────────────────────────

  private async geocodeBAN(address: string): Promise<GeocodeResult> {
    const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(address)}&limit=5`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`BAN API ${res.status}`);

    const data = (await res.json()) as BanResponse;
    if (!data.features?.length) {
      throw new NotFoundException('Address not found for the given country');
    }

    const best = data.features[0];
    const [lng, lat] = best.geometry.coordinates;
    return { lat, lng, displayAddress: best.properties.label, source: 'BAN' };
  }

  private async autocompleteBAN(q: string): Promise<AutocompleteResult[]> {
    const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=5`;
    const res = await fetch(url);
    if (!res.ok) return [];

    const data = (await res.json()) as BanResponse;
    return (data.features ?? []).map((f) => ({
      label: f.properties.label,
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
    }));
  }

  // ─── Nominatim (non-FR countries) ─────────────────────────────

  private async geocodeNominatim(
    address: string,
    country: SupportedCountry,
  ): Promise<GeocodeResult> {
    await this.waitForNominatimRateLimit();

    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&countrycode=${country.toLowerCase()}&format=json&limit=5`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'RegieArtApp/1.0 (contact@regieart.com)' },
    });

    this.lastNominatimCallAt = Date.now();

    if (!res.ok) throw new Error(`Nominatim API ${res.status}`);

    const places = (await res.json()) as NominatimPlace[];
    if (!places.length) {
      throw new NotFoundException('Address not found for the given country');
    }

    const best = places[0];
    return {
      lat: parseFloat(best.lat),
      lng: parseFloat(best.lon),
      displayAddress: best.display_name,
      source: 'nominatim',
    };
  }

  private async autocompleteNominatim(
    q: string,
    country: SupportedCountry,
  ): Promise<AutocompleteResult[]> {
    await this.waitForNominatimRateLimit();

    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&countrycode=${country.toLowerCase()}&format=json&limit=5`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'RegieArtApp/1.0 (contact@regieart.com)' },
    });

    this.lastNominatimCallAt = Date.now();

    if (!res.ok) return [];

    const places = (await res.json()) as NominatimPlace[];
    return places.map((p) => ({
      label: p.display_name,
      lat: parseFloat(p.lat),
      lng: parseFloat(p.lon),
    }));
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private async waitForNominatimRateLimit(): Promise<void> {
    const elapsed = Date.now() - this.lastNominatimCallAt;
    if (elapsed < 1100) {
      await new Promise((r) => setTimeout(r, 1100 - elapsed));
    }
  }

  normalizeAddress(address: string): string {
    return address.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private async getCached<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.getClient().get(key);
      if (raw) return JSON.parse(raw) as T;
    } catch {
      this.logger.debug('Redis unavailable, bypassing geo cache read');
    }
    return null;
  }

  private async setCache(key: string, value: unknown, ttl: number): Promise<void> {
    try {
      await this.redis.getClient().setex(key, ttl, JSON.stringify(value));
    } catch {
      this.logger.debug('Redis unavailable, geo result not cached');
    }
  }
}
