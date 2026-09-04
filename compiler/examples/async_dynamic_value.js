async function useDynamicValue() {
  const status = await getStatus();
  if (status === 42) {
    console.log('async dynamic value retained');
  }
}

useDynamicValue();
