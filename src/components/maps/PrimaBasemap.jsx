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

export default function PrimaBasemap({ mode = 'light', provider = 'osm' }) {
  const [activeProvider, setActiveProvider] = useState(provider)
  const selectedProvider = PROVIDERS[activeProvider] || PROVIDERS.osm
  const selectedMode = selectedProvider[mode] || selectedProvider.light

  return (
    <TileLayer
      key={`${activeProvider}-${mode}`}
      attribution={selectedMode.attribution}
      url={selectedMode.url}
      subdomains={selectedMode.subdomains}
      maxZoom={19}
      eventHandlers={{
        tileerror: () => {
          if (activeProvider !== 'osm') setActiveProvider('osm')
        },
      }}
    />
  )
}
