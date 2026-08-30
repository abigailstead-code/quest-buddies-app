import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { GameProvider } from './context/GameContext'
import { CalendarPage } from './pages/CalendarPage'
import { DashboardPage } from './pages/DashboardPage'
import { HistoryPage } from './pages/HistoryPage'
import { MapPage } from './pages/MapPage'
import { RewardsPage } from './pages/RewardsPage'
import { SettingsPage } from './pages/SettingsPage'
import { TodayPage } from './pages/TodayPage'

export default function App() {
  return (
    <GameProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<TodayPage />} />
            <Route path="map" element={<MapPage />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="rewards" element={<RewardsPage />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </GameProvider>
  )
}
