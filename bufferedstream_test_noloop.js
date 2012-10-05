
/*
 * This test is simply run manually to verify it doesn't peg CPU
 *
 * node bufferedstream_test_noloop.js
 *
 * While it is running, manually verify CPU with top or another monitor
 * and it should not be pegged at 100%
 *
 * The test exits regardless of outcome after one minute
 *
 */

var BufferedStream = require("./bufferedstream");

var bs1 = new BufferedStream('Hello world');
bs1.pause();

var bs2 = new BufferedStream('');
bs2.pause();

var bs3 = new BufferedStream();
bs3.pause();
bs3.write('Hello world');

var bs4 = new BufferedStream();
bs4.pause();
bs4.write('');

var bs5 = new BufferedStream();
bs5.pause();
bs5.end('Hello world');

var bs6 = new BufferedStream();
bs6.pause();
bs6.end('');

console.warn('Created buffered streams, and if working properly this should exit on its own quickly');
console.warn("If it doesn't then it is probably in an infinate loop, use control-c to terminate");
