import { Tabs } from '@curve/ui';

import { useI18n } from '../i18n';

import type { ReactElement } from 'react';

function NavEmpty({ message }: { message: string }): ReactElement {
  return <p className="cs-nav__empty">{message}</p>;
}

/** Left panel: a tabbed navigator. T0.4 fills it with empty states; T1.x adds lists. */
export function Sidebar(): ReactElement {
  const { t } = useI18n();

  return (
    <aside className="cs-app__sidebar" aria-label={t('shell.sidebar.label')} data-testid="sidebar">
      <Tabs
        label={t('shell.nav.label')}
        tabs={[
          {
            id: 'tables',
            label: t('shell.nav.tables'),
            content: <NavEmpty message={t('shell.nav.empty.tables')} />,
          },
          {
            id: 'charts',
            label: t('shell.nav.charts'),
            content: <NavEmpty message={t('shell.nav.empty.charts')} />,
          },
          {
            id: 'styles',
            label: t('shell.nav.styles'),
            content: <NavEmpty message={t('shell.nav.empty.styles')} />,
          },
        ]}
      />
    </aside>
  );
}
