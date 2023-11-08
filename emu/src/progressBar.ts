function printProgress(progress: number): void {
  const progressBarLength = 50;
  const filledProgressBarLength = Math.round(progress * progressBarLength);
  const emptyProgressBarLength = progressBarLength - filledProgressBarLength;

  const filledProgressBar = "█".repeat(filledProgressBarLength);
  const emptyProgressBar = "░".repeat(emptyProgressBarLength);

  if (process.stdout.isTTY) {
    process.stdout.clearLine(0); // clear current line
    process.stdout.cursorTo(0); // move cursor to beginning of line
    process.stdout.write(
      `Progress: [${filledProgressBar}${emptyProgressBar}] ${Math.round(
        progress * 100,
      )}%\n`,
    );
  } else {
    process.stdout.write(".");
  }
}

export { printProgress };
