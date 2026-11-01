// Runs one scenario in every order within its bound. Each run replays from scratch
// with a list of choices, because a suspended async function cannot be snapshotted.
import { World } from './world.mjs';

const settle = () => new Promise((resolve) => setImmediate(resolve));

function startTask(world, task) {
  Promise.resolve()
    .then(task)
    .catch((error) => {
      world.failure = world.failure || error;
    });
}

// Runs setup or teardown work in a fixed order, with no branching.
async function runToQuiet(world) {
  await settle();
  while (world.operations.length || world.timers.size) {
    if (world.operations.length) {
      const operation = world.operations.shift();
      world.note(operation.label);
      operation.run();
    } else {
      fireTimer(world, world.timers.keys().next().value);
    }
    await settle();
  }
}

function fireTimer(world, id) {
  const callback = world.timers.get(id);
  world.timers.delete(id);
  world.note('the 800 ms write-back timer fires');
  startTask(world, callback);
}

async function prepare(source, scenario) {
  const world = new World(source);
  for (const note of scenario.notes) world.seed(note);
  startTask(world, () => world.linkedFolder.link());
  await runToQuiet(world);
  for (const step of scenario.setup || []) {
    startTask(world, () => step.run(world));
    await runToQuiet(world);
  }
  world.trace = [];
  return world;
}

function isQuiet(world) {
  return world.operations.length === 0 && world.active.size === 0;
}

function availableChoices(world, scenario, remaining) {
  const choices = world.operations.map((operation, index) => ({ type: 'operation', index, label: operation.label }));
  const timersHeld = scenario.holdTimersUntilDone && remaining.length > 0;
  if (!timersHeld) for (const id of world.timers.keys()) choices.push({ type: 'timer', id });
  const events = scenario.serial ? remaining.slice(0, isQuiet(world) ? 1 : 0) : remaining;
  for (const event of events) choices.push({ type: 'event', event });
  return choices;
}

function apply(world, choice, remaining) {
  if (choice.type === 'timer') return fireTimer(world, choice.id);
  if (choice.type === 'operation') {
    const [operation] = world.operations.splice(choice.index, 1);
    world.note(operation.label);
    return operation.run();
  }
  remaining.splice(remaining.indexOf(choice.event), 1);
  world.active.add(choice.event);
  return startTask(world, async () => {
    await choice.event.run(world);
    world.active.delete(choice.event);
  });
}

// The user pressing Read now at the end gives every unread edit a last chance, so
// a reported loss is a real loss rather than an edit nobody had read yet.
async function finish(world) {
  world.note('at the end, the user presses Read now');
  startTask(world, () => world.linkedFolder.readAll(false));
  await runToQuiet(world);
}

async function runOnce(source, scenario, prefix) {
  const world = await prepare(source, scenario);
  world.active = new Set();
  const remaining = [...scenario.events];
  const branching = [];
  for (let step = 0; ; step += 1) {
    await settle();
    const choices = availableChoices(world, scenario, remaining);
    if (!choices.length) break;
    const picked = step < prefix.length ? prefix[step] : 0;
    branching.push({ picked, count: choices.length });
    apply(world, choices[picked], remaining);
  }
  await finish(world);
  return { world, branching };
}

function nextPrefix(branching) {
  for (let step = branching.length - 1; step >= 0; step -= 1) {
    if (branching[step].picked + 1 < branching[step].count) {
      return [...branching.slice(0, step).map((entry) => entry.picked), branching[step].picked + 1];
    }
  }
  return null;
}

function record(violations, world, stepCount) {
  for (const violation of world.violations) {
    const known = violations.get(violation.property);
    if (known) known.schedules += 1;
    if (!known || stepCount < known.stepCount) {
      violations.set(violation.property, {
        ...violation,
        schedules: (known?.schedules || 0) + (known ? 0 : 1),
        stepCount,
        trace: [...world.trace],
      });
    }
  }
}

// `maxRuns` keeps a mutant that blows up the search from hanging the command. A
// capped result is reported as incomplete, never as a pass.
export async function explore(source, scenario, check, maxRuns) {
  const violations = new Map();
  let prefix = [];
  let runs = 0;
  while (prefix && runs < maxRuns) {
    const { world, branching } = await runOnce(source, scenario, prefix);
    if (world.failure) throw world.failure;
    runs += 1;
    world.violations = check(world, scenario);
    record(violations, world, world.trace.length);
    prefix = nextPrefix(branching);
  }
  return { scenario: scenario.name, runs, complete: prefix === null, violations: [...violations.values()] };
}
