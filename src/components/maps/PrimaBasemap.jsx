import { useState } from 'react'
import { TileLayer } from 'react-leaflet'

const PROVIDERS = {
  carto: {
    light: {
      url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
    },
    dark: {
      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
    },
  },
  esri: {
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

const FALLBACK_ORDER = ['esri', 'osm']

export default function PrimaBasemap({ mode = 'light', provider = 'esri' }) {
  const [activeProvider, setActiveProvider] = useState(provider)
  const selectedProvider = PROVIDERS[activeProvider] || PROVIDERS.esri
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
      maxZoom={19}
      eventHandlers={{
        tileerror: handleTileError,
      }}
    />
  )
}
