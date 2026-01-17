const readline = require("readline");

function askYesNo(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y");
    });
  });
}

function askChoice(question, options) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    console.log(question);
    options.forEach((opt, i) => {
      console.log(`[${i + 1}] ${opt.label}`);
    });

    const ask = () => {
      rl.question(`\nSelect an option (1-${options.length}): `, (answer) => {
        const choice = parseInt(answer);
        if (choice >= 1 && choice <= options.length) {
          rl.close();
          resolve(options[choice - 1].value);
        } else {
          console.log(`❌ Invalid choice. Please enter a number between 1 and ${options.length}.`);
          ask();
        }
      });
    };

    ask();
  });
}

module.exports = { askYesNo, askChoice };
