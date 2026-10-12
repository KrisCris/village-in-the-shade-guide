import { useEffect, useState } from "react";
import type { Entity } from "../../data/types";
import WorkflowEditor from "./WorkflowEditor";
import { dataHref, tr } from '../../i18n/active';
import { I18nProvider } from '../../i18n/react';
import type { Locale } from '../../i18n/locales';

export default function AsyncWorkflowPlanner({ locale }: { locale?: Locale }) {
  return <I18nProvider locale={locale}><WorkflowLoader /></I18nProvider>;
}

function WorkflowLoader() {
  const [entities, setEntities] = useState<Entity[] | null>(null),
    [error, setError] = useState(false),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    fetch(dataHref("/workflow-data.json"), { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error("load");
        return r.json();
      })
      .then((data) => {
        if (!Array.isArray(data)) throw new Error("format");
        setEntities(data);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(true);
      });
    return () => controller.abort();
  }, [attempt]);
  return entities ? (
    <WorkflowEditor entities={entities} />
  ) : (
    <div className="wf-loading" role="status">
      {error ? (
        <>
          <p>{tr('生产数据加载失败')}</p>
          <button onClick={() => setAttempt((n) => n + 1)}>{tr('重试')}</button>
        </>
      ) : (
        tr('正在加载作物、加工配方与留货目录…')
      )}
    </div>
  );
}
