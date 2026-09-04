async function useDynamicValues() {
  const response = await getResponse();
  if (response.status === 201) {
    console.log('async dynamic object retained');
  }
  const message = await getMessage();
  console.log(message);
}

useDynamicValues();
