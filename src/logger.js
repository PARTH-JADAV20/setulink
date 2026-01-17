const ora = require("ora").default;
const chalk = require("chalk").default;

const spinner = ora();

const log = {
  success: (msg) => console.log(chalk.green("✔ " + msg)),
  info: (msg) => console.log(chalk.blue("ℹ " + msg)),
  error: (msg) => console.log(chalk.red("✖ " + msg))
};

module.exports = { spinner, log };
