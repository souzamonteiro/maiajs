async function useDynamicValues() {
  const response = await getResponse();
  if (response.status === 201) {
    console.log('async dynamic object retained');
  }
  if (response.meta.status === 202) {
    console.log('async dynamic nested object retained');
  }
  if (response.score === 3.5) {
    console.log('async dynamic fractional object retained');
  }
  const description = response.describe('dynamic status: ');
  const combined = response.combine('dynamic meta: ', response.meta, 2.5);
  console.log(description);
  console.log(combined);
  console.log(response.scale(2.5));
  const message = await getMessage();
  console.log(message);
}

useDynamicValues();
