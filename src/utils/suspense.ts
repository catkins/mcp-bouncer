type Status = 'pending' | 'success' | 'error';

export function wrapPromise<T>(promise: Promise<T>) {
  let status: Status = 'pending';
  let result: any;
  const suspender = promise.then(
    (r) => {
      status = 'success';
      result = r;
    },
    (e) => {
      status = 'error';
      result = e;
    }
  );
  return {
    read(): T {
      if (status === 'pending') throw suspender;
      if (status === 'error') throw result;
      return result as T;
    },
  };
}

