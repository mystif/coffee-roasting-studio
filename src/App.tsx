import { useEffect } from 'react'
import { disconnectRoaster, stopReplay } from './live/runtime'
import { CoffeesScreen } from './screens/CoffeesScreen'
import { DiagnosticsScreen } from './screens/DiagnosticsScreen'
import { HistoryScreen } from './screens/HistoryScreen'
import { LiveScreen } from './screens/LiveScreen'
import { RoastDetailScreen } from './screens/RoastDetailScreen'
import { ProfilesScreen } from './screens/ProfilesScreen'
import { AnalysisScreen } from './screens/AnalysisScreen'
import { Sidebar, useRoute } from './ui/nav'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { DialogHost } from './ui/dialog'

export default function App() {
  const r = useRoute()
  useEffect(() => {
    // the diagnostics page needs the port for itself
    if (r.name === 'diagnostics') {
      stopReplay()
      void disconnectRoaster()
    }
  }, [r.name])
  return (
    <>
      <div className="flex h-screen">
        <div key={r.name} className="page-in min-w-0 flex-1">
          <ErrorBoundary resetKey={location.hash}>
            <Screen r={r} />
          </ErrorBoundary>
        </div>
        <Sidebar />
      </div>
      <DialogHost />
    </>
  )
}

function Screen({ r }: { r: ReturnType<typeof useRoute> }) {
  switch (r.name) {
    case 'diagnostics':
      return <DiagnosticsScreen />
    case 'history':
      return <HistoryScreen coffeeId={r.coffeeId} />
    case 'roast':
      return <RoastDetailScreen id={r.id} />
    case 'coffees':
      return <CoffeesScreen />
    case 'profiles':
      return <ProfilesScreen />
    case 'analysis':
      return <AnalysisScreen ids={r.ids} />
    default:
      return <LiveScreen />
  }
}
