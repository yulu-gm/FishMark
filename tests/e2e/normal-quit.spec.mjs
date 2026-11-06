import { test } from './product-fixture.mjs';

test('explicit Quit completes after the asynchronous window close', async ({ product }) => {
  const source = '# Quit lifecycle\n';
  await product.seed(source, 60_000);
  await product.launch(source);
  await product.normalClose();
});
