/**
 * src/config/vehicles.ts
 *
 * The fleet shown in the "Explore" section and on the Vehicles screen.
 *
 * ---------------------------------------------------------------------------
 * HOW TO ADD YOUR IMAGES
 * ---------------------------------------------------------------------------
 * 1. Put the files in  assets/vehicles/  — e.g. assets/vehicles/sedan-front.png
 * 2. Add an entry to the vehicle's `angles` array below:
 *
 *        { label: 'Front', source: require('../../assets/vehicles/sedan-front.png') },
 *
 * The path must be a literal. Metro resolves require() for images at BUILD
 * time, so a variable path or a template string will not work — this is why
 * the list is hardcoded here rather than generated from a filename.
 *
 * Landscape artwork around 800x450 (16:9) suits the gallery shape. Transparent
 * PNGs sit best on the dark card.
 *
 * ---------------------------------------------------------------------------
 * ANGLES
 * ---------------------------------------------------------------------------
 * `angles` is what the Vehicles screen swipes through. It is deliberately a
 * plain list rather than fixed front/side/rear fields: vehicles do not all
 * photograph the same way — a bus interior shot matters, a hatchback's does
 * not — and a fixed shape would force empty slots for the ones that lack a
 * view. Order is display order.
 *
 * A vehicle with ONE angle still works: the gallery drops its pager chrome and
 * renders a single image, so the screen is correct today with the artwork that
 * already exists, and improves as you drop more files in.
 *
 * `image` stays the single card thumbnail used by the home-screen Explore grid.
 * It is kept separate from `angles` so the compact card always gets the shot
 * chosen to read well at that size, rather than whichever angle happens to be
 * first.
 *
 * ---------------------------------------------------------------------------
 * `key` MUST match the backend
 * ---------------------------------------------------------------------------
 * It is the same vehicleClass string used by fare_configs and by
 * VEHICLE_CLASSES in catalog.ts. Anything shown here that riders can be
 * quoted for has to line up, or the fare lookup silently misses.
 */

import type { ImageSourcePropType } from 'react-native';

/** One photographed view of a vehicle. */
export interface VehicleAngle {
  /** Shown under the gallery, e.g. "Front", "Side", "Interior". */
  label: string;
  source: ImageSourcePropType;
}

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
  /** Thumbnail for the compact home-screen card. null falls back to `glyph`. */
  image: ImageSourcePropType | null;
  /** Every view of this vehicle, swiped through on the Vehicles screen. */
  angles: VehicleAngle[];
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
    image: require('../../assets/vehicles/sedan.png'),
    angles: [
      { label: 'Side', source: require('../../assets/vehicles/sedan.png') },
      // Drop more files in assets/vehicles/ and add them here:
      // { label: 'Front',    source: require('../../assets/vehicles/sedan-front.png') },
      // { label: 'Rear',     source: require('../../assets/vehicles/sedan-rear.png') },
      // { label: 'Interior', source: require('../../assets/vehicles/sedan-interior.png') },
    ],
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
    angles: [
      { label: 'Side', source: require('../../assets/vehicles/suv.png') },
      // { label: 'Front',    source: require('../../assets/vehicles/suv-front.png') },
      // { label: 'Rear',     source: require('../../assets/vehicles/suv-rear.png') },
      // { label: 'Interior', source: require('../../assets/vehicles/suv-interior.png') },
    ],
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
    angles: [
      { label: 'Side', source: require('../../assets/vehicles/tempo.png') },
      // { label: 'Front',    source: require('../../assets/vehicles/tempo-front.png') },
      // { label: 'Rear',     source: require('../../assets/vehicles/tempo-rear.png') },
      // { label: 'Interior', source: require('../../assets/vehicles/tempo-interior.png') },
    ],
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
    angles: [
      { label: 'Side', source: require('../../assets/vehicles/bus.png') },
      // { label: 'Front',    source: require('../../assets/vehicles/bus-front.png') },
      // { label: 'Rear',     source: require('../../assets/vehicles/bus-rear.png') },
      // { label: 'Interior', source: require('../../assets/vehicles/bus-interior.png') },
    ],
    glyph: '🚌',
  },
];

/** How many appear in the home-screen preview before "View all". */
export const VEHICLE_PREVIEW_COUNT = 4;