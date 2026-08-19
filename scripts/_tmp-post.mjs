const [,, actionId, valuesJson] = process.argv;
const res = await fetch('http://127.0.0.1:3000/api/runtime/action', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ actionId, context: { componentValues: JSON.parse(valuesJson), routeParams: JSON.parse(process.argv[5] ?? '{}') } }),
});
console.log(res.status, await res.text());
