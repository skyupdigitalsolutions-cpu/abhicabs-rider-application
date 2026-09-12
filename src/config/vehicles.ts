/**
 * src/config/vehicles.ts
 *
 * The fleet shown in the "Explore" section and on the Vehicles screen.
 *
 * ---------------------------------------------------------------------------
 * HOW TO ADD YOUR IMAGES
 * ---------------------------------------------------------------------------
 * 1. Put the files in  assets/vehicles/  — e.g. assets/vehicles/sedan.png
 * 2. Replace `image: null` below with a require():
 *
 *        image: require('../../assets/vehicles/sedan.png'),
 *
 * The path must be a literal. Metro resolves require() for images at BUILD
 * time, so a variable path or a template string will not work — this is why
 * the list is hardcoded here rather than generated from a filename.
 *
 * Until an image is added the card falls back to a glyph, so the section
 * renders correctly with no images, some images, or all of them.
 *
 * Landscape artwork around 800x450 (16:9) suits the card shape. Transparent
 * PNGs sit best on the dark card.
 *
 * ---------------------------------------------------------------------------
 * `key` MUST match the backend
 * ---------------------------------------------------------------------------
 * It is the same vehicleClass string used by fare_configs and by
 * VEHICLE_CLASSES in catalog.ts. Anything shown here that riders can be
 * quoted for has to line up, or the fare lookup silently misses.
 */

import type { ImageSourcePropType } from 'react-native';

export interface VehicleShowcase {
  /** Backend vehicleClass string. Must match catalog.ts / fare_configs. */
  key: string;
  name: string;
  seats: number;
  /** One line for the card. */
  blurb: string;
  /** Longer copy, shown only on the Vehicles screen. */
  detail: string;
  /** Bags that realistically fit — the question riders actually ask. */
  luggage: string;
  /** null until artwork is added; the card falls back to `glyph`. */
  image: ImageSourcePropType | null;
  /** Stand-in while there is no image. */
  glyph: string;
}

export const VEHICLES: VehicleShowcase[] = [
  {
    key: 'sedan',
    name: 'Sedan',
    seats: 4,
    blurb: 'Compact and budget-friendly',
    detail: 'The cheapest way to get across town. Best for one or two people with light bags.',
    luggage: '1 small bag',
    image: require('../../assets/vehicles/sedan.png'), // require('../../assets/vehicles/hatchback.png'),
    glyph: '🚗',
  },
  {
    key: 'suv',
    name: 'Suv',
    seats: 4,
    blurb: 'Comfortable for city rides',
    detail: 'More legroom and boot space than a hatchback. The usual choice for airport runs.',
    luggage: '2 medium bags',
    image: require('../../assets/vehicles/suv.png'),
    glyph: '🚙',
  },
  {
    key: 'tempo',
    name: 'Tempo Traveller',
    seats: 6,
    blurb: 'More room, longer trips',
    detail: 'Six seats and a high ride. Worth it for outstation trips and rougher roads.',
    luggage: '4 large bags',
    image: require('../../assets/vehicles/tempo.png'),
    glyph: '🚐',
  },
  {
    key: 'bus',
    name: 'Bus',
    seats: 12,
    blurb: 'Group travel, large luggage',
    detail: 'Twelve seats for family trips, office outings and weddings. Book ahead.',
    luggage: '10+ bags',
    image: require('../../assets/vehicles/bus.png'),
    glyph: '🚌',
  },
  
];

/** How many appear in the home-screen preview before "View all". */
export const VEHICLE_PREVIEW_COUNT = 4;