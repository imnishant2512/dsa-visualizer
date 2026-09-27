import { Link } from 'react-router-dom';
import { GRAPH_RUN_OPERATIONS } from '../domains/graphs/operations';
import { SUPPORTED_LANGUAGES } from '../domains/ide/languageConfig';
import { PATH_ALGORITHMS } from '../domains/pathfinding/algorithms';
import { SEARCH_ALGORITHMS } from '../domains/searching/algorithms';
import { pickMissing } from '../domains/searching/targets';
import { SORT_ALGORITHMS } from '../domains/sorting/registry';
import { randomSortedArray } from '../shared/utils/randomArray';
import { DOMAINS } from './domains';
import { HeroDemo } from './HeroDemo';
import styles from './Landing.module.css';

/*
 * Counted from the registries, not written down. The copy this replaced said
 * five pathfinding algorithms when there were six and four graph algorithms
 * when there were eight — a number typed into a sentence stops being true the
 * first time someone adds to the list it describes.
 */
const COUNTS: Record<string, string> = {
  '/sorting': `${SORT_ALGORITHMS.length} algorithms`,
  '/searching': `${SEARCH_ALGORITHMS.length} strategies`,
  '/pathfinding': `${PATH_ALGORITHMS.length} algorithms`,
  '/linear/array': '4 structures',
  '/trees': '3 modes',
  '/hashtables': '2 strategies',
  '/graphs': `${GRAPH_RUN_OPERATIONS.length} algorithms`,
  '/ide': `${SUPPORTED_LANGUAGES.length} languages`,
};

const MISSING_SEED = 7;
const MISSING_SIZE = 30;

/**
 * Three runs worth opening, each a real link into a configured page rather
 * than a description of one. The parameters are the ones the pages already
 * round-trip, so each scenario is exactly reproducible.
 */
const SCENARIOS = [
  {
    tag: '01',
    title: 'Watch Quick Sort degrade',
    body: 'Reversed input turns its n log n average into the quadratic worst case. Run it to the end and the verdict says by how much.',
    to: '/sorting?algo=quick&size=70&shape=reversed&seed=2024',
  },
  {
    tag: '02',
    title: 'Merge versus Quick, one array',
    body: 'Same input on one shared clock, with a signed delta on every counter. Merge writes more; Quick compares more.',
    to: '/sorting?algo=merge&size=45&shape=random&seed=2024&vs=quick',
  },
  {
    tag: '03',
    title: 'Search for something absent',
    body: 'The interesting case is a miss: the window has to close all the way. See how many probes it takes to be sure.',
    to: `/searching?algo=binary&size=${MISSING_SIZE}&seed=${MISSING_SEED}&target=${pickMissing(
      randomSortedArray(MISSING_SIZE, MISSING_SEED),
    )}`,
  },
];

const PILLARS = [
  {
    title: 'Steps, not animations',
    body: 'An algorithm emits a list of discrete operations. Nothing is tweened, so nothing is approximate — what is on screen is the state after step N.',
  },
  {
    title: 'Exactly reversible',
    body: 'Every step carries what it overwrote, so stepping back applies its precise inverse. Scrubbing replays from the start and lands on the identical state.',
  },
  {
    title: 'One player, seven domains',
    body: 'The same transport drives sorting, grids, trees, tables and graphs, so the controls learned on the first screen work on all of them.',
  },
];

export function Landing() {
  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroText}>
          <div>
            <div className={styles.kicker}>Reversible by construction</div>
            <h1 className={styles.title}>Every step runs backwards.</h1>
            <p className={styles.lede}>
              Algorithms here emit discrete steps instead of animating. Pause anywhere, walk back
              through a comparison, change speed mid-run — the run beside this is doing exactly
              that, on a loop.
            </p>
          </div>
          <div className={styles.heroActions}>
            <Link to="/sorting" className={styles.primary}>
              Open the sorting run
            </Link>
          </div>
        </div>
        <HeroDemo />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionLabel}>Start with a question worth asking</div>
        <div className={styles.scenarios}>
          {SCENARIOS.map((scenario) => (
            <Link key={scenario.tag} to={scenario.to} className={styles.scenario}>
              <span className={styles.scenarioTag}>{scenario.tag}</span>
              <span className={styles.scenarioTitle}>{scenario.title}</span>
              <span className={styles.scenarioBody}>{scenario.body}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.listHead}>
          <div className={styles.sectionLabel}>Eight domains, one engine</div>
        </div>
        {/*
          A ruled list rather than a grid of cards. Every card carried an emoji
          as its icon — eight glyphs drawn in each platform's own colour palette
          against a deliberately restrained one — and the grid gave the eight
          domains equal visual weight with no order. A numbered list reads top
          to bottom and puts the count where it can be compared.
        */}
        <ol className={styles.domains}>
          {DOMAINS.map((domain, index) => (
            <li key={domain.path}>
              <Link to={domain.path} className={styles.domain}>
                <span className={styles.domainIndex}>{String(index + 1).padStart(2, '0')}</span>
                <span className={styles.domainLabel}>{domain.label}</span>
                <span className={styles.domainBlurb}>{domain.blurb}</span>
                <span className={styles.domainCount}>{COUNTS[domain.path]}</span>
                <span className={styles.domainArrow} aria-hidden>
                  ↗
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.pillars}>
        <div className={styles.pillarsLabel}>Why it is built this way</div>
        <div className={styles.pillarRow}>
          {PILLARS.map((pillar) => (
            <div key={pillar.title} className={styles.pillar}>
              <div className={styles.pillarTitle}>{pillar.title}</div>
              <p className={styles.pillarBody}>{pillar.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
