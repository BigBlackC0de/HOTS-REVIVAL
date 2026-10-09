import { HashRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Coach } from "./pages/Coach";
import { Dashboard } from "./pages/Dashboard";
import { Draft } from "./pages/Draft";
import { Game } from "./pages/Game";
import { LiveControl } from "./pages/LiveControl";
import { MatchReport } from "./pages/MatchReport";
import { Matches } from "./pages/Matches";
import { Meta } from "./pages/Meta";
import { Overlay } from "./pages/Overlay";
import { Settings } from "./pages/Settings";

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/overlay" element={<Overlay />} />
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="game" element={<Game />} />
          <Route path="matches" element={<Matches />} />
          <Route path="matches/:id" element={<MatchReport />} />
          <Route path="draft" element={<Draft />} />
          <Route path="meta" element={<Meta />} />
          <Route path="coach" element={<Coach />} />
          <Route path="live" element={<LiveControl />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
