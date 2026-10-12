import { useState } from 'react'
import { TileLayer } from 'react-leaflet'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || ''
const CARTO_KEY = import.meta.env.VITE_CARTO_BASEMAP_KEY || import.meta.env.VITE_CARTO_API_KEY || ''
const cartoKeyQuery = CARTO_KEY ? `?api_key=${encodeURIComponent(CARTO_KEY)}` : ''

const PROVIDERS = {
  mapbox: {
    enabled: Boolean(MAPBOX_TOKEN),
    light: {
      url: `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}?access_token=${encodeURIComponent(MAPBOX_TOKEN)}`,
      attribution: '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 22,
    },
    dark: {
      url: `https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/256/{z}/{x}/{y}?access_token=${encodeURIComponent(MAPBOX_TOKEN)}`,
      attribution: '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 22,
    },
  },
  carto: {
    enabled: Boolean(CARTO_KEY),
    light: {
      url: `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png${cartoKeyQuery}`,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
    },
    dark: {
      url: `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png${cartoKeyQuery}`,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
    },
  },
  esri: {
    enabled: true,
    light: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Tiles &copy; Esri, OpenStreetMap contributors',
    },
    dark: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Tiles &copy; Esri, OpenStreetMap contributors',
    },
  },
  osm: {
    enabled: true,
    light: {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
    dark: {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
}

const FALLBACK_ORDER = ['mapbox', 'carto', 'esri', 'osm'].filter(key => PROVIDERS[key]?.enabled)
const DEFAULT_PROVIDER = FALLBACK_ORDER[0] || 'osm'

export default function PrimaBasemap({ mode = 'light', provider = DEFAULT_PROVIDER }) {
  const [activeProvider, setActiveProvider] = useState(PROVIDERS[provider]?.enabled ? provider : DEFAULT_PROVIDER)
  const selectedProvider = PROVIDERS[activeProvider] || PROVIDERS[DEFAULT_PROVIDER] || PROVIDERS.osm
  const selectedMode = selectedProvider[mode] || selectedProvider.light
  const handleTileError = () => {
    const currentIndex = FALLBACK_ORDER.indexOf(activeProvider)
    const nextProvider = FALLBACK_ORDER[currentIndex + 1]
    if (nextProvider) setActiveProvider(nextProvider)
  }

  return (
    <TileLayer
      key={`${activeProvider}-${mode}`}
      attribution={selectedMode.attribution}
      url={selectedMode.url}
      subdomains={selectedMode.subdomains}
      maxZoom={selectedMode.maxZoom || 19}
      eventHandlers={{
        tileerror: handleTileError,
      }}
    />
  )
}
