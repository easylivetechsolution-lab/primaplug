import { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.primaplug.app',
  appName: 'PrimaPlug',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    hostname: 'primaplug.com'
  },
  plugins: {
    Geolocation: {
      permissions: ['location']
    },
    Camera: {
      permissions: ['camera']
    }
  }
}

export default config
