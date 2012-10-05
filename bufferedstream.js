var util = require("util");
var Stream = require("stream").Stream;

module.exports = BufferedStream;

/**
 * A readable/writable Stream that buffers data until next tick. The `maxSize`
 * determines the byte size at which the buffer is considered "full". When the
 * stream is full, calls to `write` will return `false` which should indicate
 * to the writing stream that it should pause. This argument may be omitted to
 * indicate this stream has no maximum size.
 *
 * The `source` and `sourceEncoding` arguments may be used to easily wrap this
 * stream around another, or a simple string. If the source is another stream,
 * it is piped to this stream. If it's a string, it is used as the entire
 * contents of this stream and passed to `end`.
 */
function BufferedStream(maxSize, source, sourceEncoding) {
  Stream.call(this);

  // Public interface.
  this.size = 0;
  this.encoding = null;
  this.readable = true;
  this.writable = true;
  this.ended = false;

  if (typeof maxSize != "number") {
    sourceEncoding = source;
    source = maxSize;
    maxSize = -1;
  }

  // This is a soft limit. It's only used to indicate to other streams
  // writing to this one when they should pause. If negative (the default),
  // this stream will buffer indefinitely.
  this.maxSize = maxSize;

  this._buffer = [];
  this._wait = false;
  this._flushing = false;
  this._wasFull = false;

  if (typeof source != "undefined") {
    if (source instanceof Stream) {
      source.pipe(this);
    } else {
      this.end(source, sourceEncoding);
    }
  }
}

util.inherits(BufferedStream, Stream);

/**
 * A read-only property that returns `true` if this stream has no data to emit.
 */
BufferedStream.prototype.__defineGetter__("empty", function () {
  return this._buffer.length == 0;
});

/**
 * A read-only property that returns `true` if this stream's buffer is full.
 */
BufferedStream.prototype.__defineGetter__("full", function () {
  return this.maxSize >= 0 && this.maxSize < this.size;
});

/**
 * Sets this stream's encoding. If an encoding is set, this stream will emit
 * strings using that encoding. Otherwise, it emits buffers.
 */
BufferedStream.prototype.setEncoding = function (encoding) {
  this.encoding = encoding;
};

/**
 * Prevents this stream from emitting `data` events until `resume` is called.
 * This does not prevent writes to this stream.
 */
BufferedStream.prototype.pause = function () {
  this._wait = true;
  this.emit("pause");
};

/**
 * Resumes emitting `data` events.
 */
BufferedStream.prototype.resume = function () {
  this._wait = false;
  this.emit("resume");
  if (!this.empty) this._flushOnNextTick();
  if (this.ended) this._emitEndDestroyNextTick();
};

/**
 * Writes the given `chunk` of data to this stream. Returns `false` if this
 * stream is full and should not be written to further until drained, `true`
 * otherwise.
 */
BufferedStream.prototype.write = function (chunk, encoding) {
  if (!this.writable || this.ended) {
    throw new Error("Stream is not writable");
  }

  if (typeof chunk == "string") {
    chunk = new Buffer(chunk, encoding);
  }

  this._buffer.push(chunk);
  this.size += chunk.length;

  if (!this._flushing) {
    this._flushOnNextTick();  // flush writes
    this._flushing = true;
  }

  if (this.full) {
    this._wasFull = true;
    return false;
  }

  return true;
};

/**
 * Calls flush during next tick. This is invoked in
 * write() and possibly in resume().
 *
 * If stream is paused, then exit the loop and
 * continue on resume() otherwise could go into
 * an infinate loop if never resumed.
 */
BufferedStream.prototype._flushOnNextTick = function () {
  var self = this;

  process.nextTick(function tick() {
    self.flush();

    if (self.empty) {
      self._flushing = false;
    } else if (self._wait) { // if paused, exit now will be continued on resume
      return; // without this, we could go into infinate loop if never resumed
    } else {
      process.nextTick(tick);
    }
  });
};

/**
 * Tries to emit all data that is currently in the buffer out to all `data`
 * listeners. If this stream is paused, not readable, has no data in the buffer
 * this method does nothing. If this stream has previously returned `false` from
 * a write and any space is available in the buffer after flushing, a `drain`
 * event is emitted.
 */
BufferedStream.prototype.flush = function () {
  var chunk;
  while (!this._wait && this.readable && this._buffer.length) {
    chunk = this._buffer.shift();
    this.size -= chunk.length;

    if (this.encoding) {
      this.emit("data", chunk.toString(this.encoding));
    } else {
      this.emit("data", chunk);
    }
  }

  // Emit "drain" if the stream was full at one point but now
  // has some room in the buffer.
  if (this._wasFull && !this.full) {
    this._wasFull = false;
    this.emit("drain");
  }
};

/**
 * Writes the given `chunk` to this stream and queues the `end` event to be
 * called as soon as all `data` events have been emitted.
 */
BufferedStream.prototype.end = function (chunk, encoding) {
  if (this.ended) {
    throw new Error("Stream is already ended");
  }

  if (arguments.length > 0) {
    this.write(chunk, encoding);
  }

  this.ended = true;
  this._emitEndDestroyNextTick(); // emit end and destroy on next tick
};

/**
 * Once the queue is empty, then emit the 'end'
 * This is invoked in `end()` and possibly `resume()`
 *
 * If the stream is paused, exit the loop
 * and continue when resumed, otherwise
 * can go into infinate loop if never resumed
 */
BufferedStream.prototype._emitEndDestroyNextTick = function () {
  var self = this;
  process.nextTick(function tick() {
    if (self.empty) {
      self.destroy();
      self.emit("end");
    } else if (self._wait) { // if paused, exit this now, continue in resume()
      return; // otherwise could go into infinate loop if never resumed
    } else {
      process.nextTick(tick);
    }
  });
};

/**
 * Destroys this stream immediately. It is no longer readable or writable. This
 * method should rarely ever be called directly by users as it will be called
 * automatically when using BufferedStream#end.
 */
BufferedStream.prototype.destroy = function () {
  this._buffer = [];
  this.readable = false;
  this.writable = false;
};
