import type { SimForm } from './model/forms'

const start = '2026-06-24T09:00:00Z'
const end = '2026-06-24T10:00:00Z'

export const presets: Record<string, SimForm> = {
  'single-energy': {
    currency: 'EUR',
    countryCode: 'NL',
    start,
    end,
    tariffs: [
      {
        id: 'energy',
        currency: 'EUR',
        taxIncluded: 'NO',
        elements: [{ components: [{ type: 'ENERGY', price: '0.30', stepSize: 1, vat: '21' }] }],
      },
    ],
    periods: [{ start, tariffId: 'energy', dimensions: [{ type: 'ENERGY', volume: '10' }] }],
    embedded: { totalCost: '3.00', totalEnergy: '10' },
  },
  'multi-tariff': {
    currency: 'EUR',
    countryCode: 'NL',
    start,
    end: '2026-06-24T11:00:00Z',
    tariffs: [
      {
        id: 'peak',
        currency: 'EUR',
        taxIncluded: 'NO',
        elements: [{ components: [{ type: 'ENERGY', price: '0.40', stepSize: 1, vat: '21' }] }],
      },
      {
        id: 'offpeak',
        currency: 'EUR',
        taxIncluded: 'NO',
        elements: [{ components: [{ type: 'ENERGY', price: '0.20', stepSize: 1, vat: '21' }] }],
      },
    ],
    periods: [
      { start, tariffId: 'peak', dimensions: [{ type: 'ENERGY', volume: '5' }] },
      {
        start: '2026-06-24T10:00:00Z',
        tariffId: 'offpeak',
        dimensions: [{ type: 'ENERGY', volume: '5' }],
      },
    ],
    embedded: { totalCost: '3.00', totalEnergy: '10' },
  },
  'min-price-clamp': {
    currency: 'EUR',
    countryCode: 'NL',
    start,
    end,
    tariffs: [
      {
        id: 'min',
        currency: 'EUR',
        taxIncluded: 'NO',
        minPrice: '2.00',
        elements: [{ components: [{ type: 'ENERGY', price: '0.10', stepSize: 1, vat: '21' }] }],
      },
    ],
    periods: [{ start, tariffId: 'min', dimensions: [{ type: 'ENERGY', volume: '5' }] }],
    embedded: { totalCost: '2.00', totalEnergy: '5' },
  },
  'mixed-step': {
    currency: 'EUR',
    countryCode: 'NL',
    start,
    end,
    tariffs: [
      {
        id: 'steps',
        currency: 'EUR',
        taxIncluded: 'NO',
        elements: [
          {
            components: [
              { type: 'ENERGY', price: '0.30', stepSize: 1000, vat: '21' },
              { type: 'TIME', price: '2.00', stepSize: 900, vat: '21' },
            ],
          },
        ],
      },
    ],
    periods: [
      {
        start,
        tariffId: 'steps',
        dimensions: [
          { type: 'ENERGY', volume: '1.4' },
          { type: 'TIME', volume: '0.5' },
        ],
      },
    ],
    embedded: { totalCost: '1.60', totalEnergy: '1.4', totalTime: '0.5' },
  },
  'time-of-day': {
    currency: 'EUR',
    countryCode: 'NL',
    start: '2026-06-24T08:00:00Z',
    end: '2026-06-24T11:00:00Z',
    tariffs: [
      {
        id: 'tod',
        currency: 'EUR',
        taxIncluded: 'NO',
        elements: [
          {
            restriction: { startTime: '09:00', endTime: '18:00' },
            components: [{ type: 'ENERGY', price: '0.40', stepSize: 1 }],
          },
          {
            components: [{ type: 'ENERGY', price: '0.20', stepSize: 1 }],
          },
        ],
      },
    ],
    periods: [
      {
        start: '2026-06-24T08:30:00Z',
        tariffId: 'tod',
        dimensions: [{ type: 'ENERGY', volume: '10' }],
      },
    ],
    embedded: { totalEnergy: '10' },
  },
}

export const presetMeta: Record<string, { label: string; description: string }> = {
  'single-energy': {
    label: 'Single energy',
    description: 'One energy tariff and one charging period for a straightforward kWh calculation.',
  },
  'multi-tariff': {
    label: 'Multi-tariff',
    description: 'Two tariffs across separate charging periods to compare peak and off-peak pricing.',
  },
  'min-price-clamp': {
    label: 'Minimum price clamp',
    description: 'A low usage session where the tariff minimum price controls the final total.',
  },
  'mixed-step': {
    label: 'Mixed billing units',
    description: 'Energy and time components using different billing units in one tariff.',
  },
  'time-of-day': {
    label: 'Time of day',
    description: 'A tariff with a restricted daytime rule plus a fallback price component.',
  },
}

export const defaultPreset = 'single-energy'
