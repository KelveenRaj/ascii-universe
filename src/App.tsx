import { BlackHoleCanvas } from './renderer/BlackHoleCanvas';
import { DevTag } from './ui/DevTag';

export default function App() {
  return (
    <main className="app">
      <BlackHoleCanvas />
      <DevTag />
    </main>
  );
}
