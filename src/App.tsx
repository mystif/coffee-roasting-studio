import { useEffect } from 'react'
import { disconnectRoaster, stopReplay } from './live/runtime'
import { CoffeesScreen } from './screens/CoffeesScreen'
import { DiagnosticsScreen } from './screens/DiagnosticsScreen'
import { HistoryScreen } from './screens/HistoryScreen'
import { LiveScreen } from './screens/LiveScreen'
import { RoastDetailScreen } from './screens/RoastDetailScreen'
import { useRoute } from './ui/nav'

export default function App() {
  const r = useRoute()
  useEffect(() => {
    // the diagnostics page needs the port for itself
    if (r.name === 'diagnostics') {
      stopReplay()
      void disconnectRoaster()
    }
  }, [r.name])
  switch (r.name) {
    case 'diagnostics':
      return <DiagnosticsScreen />
    case 'history':
      return <HistoryScreen coffeeId={r.coffeeId} />
    case 'roast':
      return <RoastDetailScreen id={r.id} />
    case 'coffees':
      return <CoffeesScreen />
    default:
      return <LiveScreen />
  }
}
