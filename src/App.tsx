import { Header } from './components/Header'
import { PlayersGrid } from './components/PlayersGrid'

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="custom-main">
        <PlayersGrid />
      </main>
    </div>
  )
}
