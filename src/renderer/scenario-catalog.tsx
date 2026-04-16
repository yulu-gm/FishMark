import type { ScenarioRegistry, TestScenario } from "@yulora/test-harness";

type ScenarioCatalogProps = {
  readonly registry: ScenarioRegistry;
  readonly selectedId: string | null;
  readonly onSelect: (scenarioId: string) => void;
};

export function ScenarioCatalog({ registry, selectedId, onSelect }: ScenarioCatalogProps) {
  const scenarios = registry.list();
  const selected = selectedId ? registry.get(selectedId) : scenarios[0] ?? null;

  if (scenarios.length === 0) {
    return (
      <p className="workbench-empty">
        No scenarios registered. Seed scenarios live in <code>packages/test-harness/src/scenarios</code>.
      </p>
    );
  }

  return (
    <div className="scenario-catalog">
      <ul
        className="scenario-list"
        role="listbox"
        aria-label="Registered scenarios"
      >
        {scenarios.map((scenario) => (
          <li key={scenario.id}>
            <button
              type="button"
              role="option"
              aria-selected={scenario.id === selectedId}
              className={`scenario-list-item${scenario.id === selectedId ? " is-selected" : ""}`}
              onClick={() => onSelect(scenario.id)}
            >
              <span className="scenario-list-title">{scenario.title}</span>
              <span className="scenario-list-id">{scenario.id}</span>
              <span className="scenario-list-tags">
                {scenario.tags.map((tag) => (
                  <span
                    key={tag}
                    className="scenario-tag"
                  >
                    {tag}
                  </span>
                ))}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {selected ? <ScenarioDetail scenario={selected} /> : null}
    </div>
  );
}

function ScenarioDetail({ scenario }: { scenario: TestScenario }) {
  return (
    <section
      className="scenario-detail"
      aria-live="polite"
    >
      <header className="scenario-detail-header">
        <p className="scenario-detail-id">{scenario.id}</p>
        <h3>{scenario.title}</h3>
        <p className="scenario-detail-summary">{scenario.summary}</p>
        <dl className="scenario-detail-meta">
          <div>
            <dt>Surface</dt>
            <dd>{scenario.surface}</dd>
          </div>
          <div>
            <dt>Tags</dt>
            <dd>{scenario.tags.join(", ")}</dd>
          </div>
          <div>
            <dt>Steps</dt>
            <dd>{scenario.steps.length}</dd>
          </div>
        </dl>
      </header>

      {scenario.preconditions && scenario.preconditions.length > 0 ? (
        <section className="scenario-detail-block">
          <h4>Preconditions</h4>
          <ul>
            {scenario.preconditions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="scenario-detail-block">
        <h4>Steps</h4>
        <ol className="scenario-steps">
          {scenario.steps.map((step, index) => (
            <li key={step.id}>
              <p className="scenario-step-title">
                <span className="scenario-step-index">{index + 1}.</span>
                <span>{step.title}</span>
                <span className={`scenario-step-kind kind-${step.kind}`}>{step.kind}</span>
              </p>
              {step.description ? (
                <p className="scenario-step-description">{step.description}</p>
              ) : null}
            </li>
          ))}
        </ol>
      </section>
    </section>
  );
}
