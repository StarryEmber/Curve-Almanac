import { Tabs } from '@curve/ui';

import { useAppState } from '../app-core/use-app-core';
import { ChartList } from '../features/charts/ChartList';
import { TableList } from '../features/tables/TableList';
import { useI18n } from '../i18n';

import type { ReactElement } from 'react';

function NavEmpty({ message }: { message: string }): ReactElement {
  return <p className="cs-nav__empty">{message}</p>;
}

/** Left panel: a tabbed navigator; T2.1 fills the Tables tab. */
export function Sidebar(): ReactElement {
  const { t } = useI18n();
  const workspace = useAppState((state) => state.workspace);

  return (
    <aside className="cs-app__sidebar" aria-label={t('shell.sidebar.label')} data-testid="sidebar">
      <Tabs
        label={t('shell.nav.label')}
        tabs={[
          {
            id: 'tables',
            label: t('shell.nav.tables'),
            content:
              workspace === null ? (
                <NavEmpty message={t('shell.nav.empty.tables')} />
              ) : (
                <TableList />
              ),
          },
          {
            id: 'charts',
            label: t('shell.nav.charts'),
            content:
              workspace === null ? (
                <NavEmpty message={t('shell.nav.empty.charts')} />
              ) : (
                <ChartList />
              ),
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
