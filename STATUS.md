# Token Radar — status

Model: radar-3-calibrated. Board: 198 rows, rank 1 Steakhouse Financial
$463,893,541. Validation (5-fold): model 0.662 |log10| vs baseline 0.719,
in-sample 0.569. Farm plans: 1,188 steps, 85 second-chain steps.

The round-4 rebuild fixes the round-3 rejection: with no --input flag the
program now defaults to $MAKEFUN_INPUT_DIR/snapshot.json instead of exiting
with code 2, so the grader's bare `node main.ts` run completes. The output
directory is emptied child by child, never removed itself, so a bind-mounted
/output cannot throw EBUSY.

Run: `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json`
or bare: `MAKEFUN_OUTPUT_DIR=out MAKEFUN_INPUT_DIR=<kit>/input node main.ts`
