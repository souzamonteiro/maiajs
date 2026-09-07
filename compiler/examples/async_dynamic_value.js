async function useDynamicValues() {
  const response = await getResponse();
  if (response.status === 201) {
    console.log('async dynamic object retained');
  }
  if (response.meta.status === 202) {
    console.log('async dynamic nested object retained');
  }
  if (response.makeMeta().status === 202) {
    console.log('async dynamic method object retained');
  }
  if (response.makeMeta().score === 3.5) {
    console.log('async dynamic method fractional property retained');
  }
  if (response.makeMeta().label === 'ready') {
    console.log('async dynamic method string property retained');
  }
  if (response.score === 3.5) {
    console.log('async dynamic fractional object retained');
  }
  const description = response.describe('dynamic status: ');
  const combined = response.combine('dynamic meta: ', response.meta, 2.5);
  if (response.describe('dynamic status: ') === 'dynamic status: 201') {
    console.log('async dynamic string method result retained');
  }
  if (response.scale(2.5) === 502.5) {
    console.log('async dynamic fractional method result retained');
  }
  if (response.count(2, 3) === 5) {
    console.log('async dynamic integer method result retained');
  }
  console.log(description);
  console.log(combined);
  console.log(response.scale(2.5));
  const message = await getMessage();
  console.log(message);
}

useDynamicValues();
