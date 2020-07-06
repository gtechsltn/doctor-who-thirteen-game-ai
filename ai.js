// NOTE: decorators do not exist in browsers, so we can't
//       use any sort of fancy auto-"bind" decoration :(
// poor man's Dependency Injection
const container = {
  ui: undefined,
  ai: undefined,
};

const VALUE_MAP = {
  /* eslint-disable prettier/prettier */
  2:     1, 4:      2, 8:      3, 16:    4,
  32:    5, 64:     6, 128:    7, 256:   8,
  512:   9, 1024:  10, 2048:  11, 4096: 12,
  8192: 13, 16384: 14, 32768: 15,
  /* eslint-enable prettier/prettier */
};

const DOCTOR_NUMBER_MAP = {
  1: '01 - William Hartnell',
  2: '02 - Patrick Troughton',
  3: '03 - Jon Pertwee',
  4: '04 - Tom Baker',
  5: '05 - Peter Davison',
  6: '06 - Colin Baker',
  7: '07 - Sylvester McCoy',
  8: '08 - Paul McGann',
  9: 'War - John Hurt',
  10: '09 - Christopher Eccleston',
  11: '10 - David Tennant',
  12: '11 - Matt Smith',
  13: '12 - Peter Capaldi',
  14: '13 - Jodie Whittaker',
};

function biggestTile(game) {
  let tiles = game.grid.cells
    .map((row) => row.map((cell) => (cell ? cell.value : 1)))
    .flat();

  let value = Math.max(...tiles);

  return { value, num: VALUE_MAP[value] };
}

class AIWorker {
  static async create() {
    let ai = new AIWorker();

    container.ai = ai;
    await container.ai.setup();

    return ai;
  }

  constructor() {
    // blegh, can't wait for decorators to land
    this.setup = this.setup.bind(this);
    this.send = this.send.bind(this);
    this.onMessage = this.onMessage.bind(this);
    this.requestNextMove = this.requestNextMove.bind(this);
  }

  async setup() {
    // fetching the URL instead of directly loading in a script
    // tag allows us to get around CORS issues
    let workerUrl =
      'https://raw.githubusercontent.com/NullVoxPopuli/doctor-who-thirteen-game-ai/master/worker.js';

    let response = await fetch(workerUrl);
    let script = await response.text();
    let blob = new Blob([script], { type: 'text/javascript' });

    this.worker = new Worker(URL.createObjectURL(blob));
    this.worker.onmessage = this.onMessage;
  }

  send(data) {
    this.worker.postMessage(data);
  }

  onMessage(e) {
    let { data } = e;

    switch (data.type) {
      case 'ack':
      case 'ready':
        console.debug(`Received: ${JSON.stringify(data)}`);

        return;
      case 'move':
        if (!data.move) {
          console.error(`No move was generated`, data);

          return;
        }

        if (data.trainingData) {
          localStorage.setItem('training', JSON.stringify(data.trainingData));
        }

        return container.ui.keyDown(data.move);
      default:
        console.error(data);
        throw new Error('Unrecognized Message');
    }
  }

  requestNextMove(game, algorithm) {
    if (!this.hasStarted) {
      this.hasStarted = true;
      this.startTime = new Date();
      this.lastNewDoctorAt = new Date();
    }

    let biggest = biggestTile(game).num;

    console.warn(`Biggest Tile: ${biggest} | ${DOCTOR_NUMBER_MAP[biggest]}`);

    if (biggest !== this.lastBiggest) {
      console.info(`New Doctor took: ${new Date() - this.lastNewDoctorAt}ms`);
      console.info(`Total Time: ${new Date() - this.startTime}ms`);

      this.lastBiggest = biggest;
      this.lastNewDoctorAt = new Date();
    }

    let trainingData;

    if (algorithm === 'RNN') {
      trainingData = JSON.parse(localStorage.getItem('training'));
    }

    this.send({
      type: 'run',
      game,
      algorithm,
      trainingData,
      maxLevel: Math.max(biggest - 3, 1),
    });
  }
}

class UI {
  static async create() {
    let ui = new UI();

    container.ui = ui;
    container.ui.setup();

    return ui;
  }

  constructor() {
    // blegh, can't wait for decorators to land
    this.setup = this.setup.bind(this);
    this.runAI = this.runAI.bind(this);
    this.keyDown = this.keyDown.bind(this);
    this.requestNextMove = this.requestNextMove.bind(this);
    this.autoRetry = this.autoRetry.bind(this);
  }

  setup() {
    let buttons = document.createElement('div');
    let runAStar = document.createElement('button');
    let runRNN = document.createElement('button');
    let autoRetry = document.createElement('input');
    let autoRetryLabel = document.createElement('label');

    buttons.style = `
     display: grid; grid-gap: 0.5rem; grid-auto-flow: column;
     position: fixed; top: 0.5rem; left: 0.5rem`;

    runAStar.innerText = 'Run A.I. (A*)';
    runRNN.innerText = 'Run A.I. (RNN)';

    autoRetryLabel.innerText = 'Auto-Retry';
    autoRetry.addEventListener('click', (e) => {
      this.isAutoRetryEnabled = e.target.checked;

      this.autoRetry();
    });

    runAStar.addEventListener('click', () => this.runAI('A*'));
    runRNN.addEventListener('click', () => this.runAI('RNN'));

    autoRetryLabel.prepend(autoRetry);

    buttons.appendChild(runAStar);
    buttons.appendChild(runRNN);
    buttons.appendChild(autoRetryLabel);

    document.body.appendChild(buttons);

    this.buttons = [runAStar, runRNN];
  }

  get isGameOver() {
    return Boolean(document.querySelector('.game-over'));
  }

  autoRetry() {
    if (!this.isAutoRetryEnabled) {
      return;
    }

    if (this.isGameOver) {
      document.querySelector('.retry-buttor').click();

      setTimeout(() => this.requestNextMove(), 1000);
    }

    // check every 10 seconds
    setTimeout(() => this.autoRetry(), 10000);
  }

  runAI(algorithm) {
    this.algorithm = algorithm;
    // this.buttons.forEach((button) => (button.disabled = true));

    this.requestNextMove();
  }

  requestNextMove() {
    let model = JSON.parse(localStorage.getItem('gameState'));

    if (model !== null && !model.over) {
      container.ai.requestNextMove(model, this.algorithm);
    }
  }

  keyDown(k) {
    let oEvent = document.createEvent('KeyboardEvent');

    function defineConstantGetter(name, value) {
      Object.defineProperty(oEvent, name, {
        get() {
          return value;
        },
      });
    }

    defineConstantGetter('keyCode', k);
    defineConstantGetter('which', k);
    defineConstantGetter('metaKey', false);
    defineConstantGetter('shiftKey', false);
    defineConstantGetter('target', { tagName: '' });

    /* eslint-disable */
    oEvent.initKeyboardEvent('keydown',
      true, true, document.defaultView, false, false, false, false, k, k
    );
    /* eslint-enable */

    document.dispatchEvent(oEvent);

    setTimeout(() => {
      this.requestNextMove();
    }, 100);
  }
}

async function boot() {
  await AIWorker.create();
  await UI.create();

  container.ai.send({ type: 'ready' });
}

boot();
