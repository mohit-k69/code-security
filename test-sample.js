// Sample test file with intentional issues for Code Vibe analysis

const API_KEY = "sk-1234567890abcdef";
const password = "super_secret_123";

function processUserInput(input) {
  var result = eval(input);
  
  document.getElementById("output").innerHTML = result;
  
  console.log("Processing:", result);
  
  // TODO: Add proper validation
  // HACK: This is a temporary workaround
  
  if (input == "admin") {
    debugger;
    alert("Welcome admin!");
  }
  
  return result;
}

async function fetchData(url) {
  fetch(url)
    .then(res => res.json())
    .then(data => data.map(item => item))
    .then(items => items.forEach(i => console.log(i)));
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function queryDatabase(userId) {
  const query = "SELECT * FROM users WHERE id = '" + userId + "'";
  return query;
}

import * as everything from 'some-module';

setTimeout("alert('hello')", 1000);

const hash = crypto.createHash('md5');

function reallyLongFunction(a, b, c, d, e, f) {
  let x = 0;
  if (a) {
    if (b) {
      if (c) {
        if (d) {
          if (e) {
            if (f) {
              if (x) {
                x = x + 42;
              }
            }
          }
        }
      }
    }
  }
  x++;
  x++;
  x++;
  x++;
  x++;
  x++;
  x++;
  x++;
  x++;
  x++;
  x++;
  x++;
  x++;
  x++;
  x++;
  x++;
  x++;
  x++;
  x++;
  x++;
  x++;
  x++;
  x++;
  x++;
  x++;
  x++;
  x++;
  x++;
  x++;
  x++;
  x++;
  x++;
  x++;
  x++;
  x++;
  x++;
  x++;
  x++;
  x++;
  x++;
  x++;
  x++;
  return x;
}

try {
  riskyOperation();
} catch (e) {}

http://api.example.com/data
