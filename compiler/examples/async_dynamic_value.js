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
  console.log(response.describe());
  const message = await getMessage();
  console.log(message);
}

useDynamicValues();
