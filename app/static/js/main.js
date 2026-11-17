import { html, render, useEffect } from './lib.js';
import { api, setUnauthorizedHandler } from './api.js';
import { clearQueries, setState, useStore } from './store.js';
import { match, useRoute } from './router.js';
import { Shell } from './components/layout.js';
import { Button, ConfirmHost, EmptyState, Toasts } from './components/ui.js';
import { AuthPage } from './pages/auth.js';
import { DashboardPage } from './pages/dashboard.js';
import { WorkoutPage } from './pages/workout.js';
import { PlansPage } from './pages/plans.js';
import { PlanEditPage } from './pages/plan-edit.js';
import { PlanReviewPage } from './pages/plan-review.js';
import { HistoryPage } from './pages/history.js';
import { WorkoutDetailPage } from './pages/workout-detail.js';
import { ExercisesPage } from './pages/exercises.js';
import { ExerciseDetailPage } from './pages/exercise-detail.js';
import { BodyPage } from './pages/body.js';
import { SettingsPage } from './pages/settings.js';

const ROUTES = [
  ['/', DashboardPage],
  ['/workout', WorkoutPage],
  ['/plans', PlansPage],
  ['/plans/:id', PlanEditPage],
  ['/plans/:id/review', PlanReviewPage],
  ['/history', HistoryPage],
  ['/history/:id', WorkoutDetailPage],
  ['/exercises', ExercisesPage],
  ['/exercises/:id', ExerciseDetailPage],
  ['/body', BodyPage],
  ['/settings', SettingsPage],
];

setUnauthorizedHandler(() => {
  clearQueries();
  setState({ user: null });
});

function NotFound() {
  return html`<div class="page"><div class="card"><${EmptyState} icon="search" title="Page not found"
    action=${html`<a class="btn primary" href="#/">Back to dashboard</a>`}>That link doesn't lead anywhere.<//></div></div>`;
}

function App() {
  const { user } = useStore();
  const path = useRoute();
  useEffect(() => {
    api.get('/auth/me').then(
      (u) => setState({ user: u }),
      () => setState({ user: null }),
    );
  }, []);

  if (user === undefined) return html`<div class="splash"><div class="spinner"></div></div>`;
  let page;
  if (user === null) {
    page = html`<${AuthPage} />`;
  } else {
    let found = html`<${NotFound} />`;
    for (const [pattern, Page] of ROUTES) {
      const params = match(pattern, path);
      // key the page by its path so navigating between two ids remounts it cleanly
      if (params) { found = html`<${Page} key=${path} ...${params} />`; break; }
    }
    page = html`<${Shell} path=${path}>${found}<//>`;
  }
  return html`${page}<${Toasts} /><${ConfirmHost} />`;
}

render(html`<${App} />`, document.getElementById('app'));
