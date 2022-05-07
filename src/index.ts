import React, {
  DependencyList, useEffect, useRef, useState,
} from 'react';
import waitPromise from './waitPromise';

export enum AsyncState {
  LOADING,
  ERROR,
  RESOLVED,
}

export type AsyncEffectState<T> =
    | [AsyncState.LOADING, null, null]
    | [AsyncState.ERROR, null, Error]
    | [AsyncState.RESOLVED, T, null];

export interface Options {
  /**
    * By default on subsequent async call, the state will switch back to loading state. Set to true
    * to disable this and skip directly to final state then the async call resolve.
    */
  noLoadingOnReload?: boolean;

  /**
    * By default on subsequent useEffect closure call, (it's dependency was updated so it was
    * called), when previous async call was not completed, new call will only gets executed after
    * previous async call completed. Any repeated calls will be removed, meaning only one final
    * call will get executed. This is done to reduce the number of async call, which usually invoke
    * some APIs on response to some user input.
    */
  disableRequestDedup?: boolean;

  /**
   * By default the async state is updated only if there are no additional pending call. Set to true
   * to change that.
   */
  updateStateOnAllCall?: boolean;

  /**
    * Delay execution of async call by this amount. If another call was pending before the async
    * call, the async call is not run in favour of later queued call.
    */
  debounceDelayMs?: number;

  /**
   * By default, debounce start on additional call when a current call is running. This is to
   * improve user feedback in case only one request is required. Set this to true to delay even the
   * first call.
   */
  debounceOnInitialCall?: boolean;
}

/**
 * Behave the same as `useAsyncEffectState`, but the async call must be triggered manually via
 * the second return value. Useful when the async call needs to be triggered by a button, for
 * example.
 */
export function useManualAsyncState<T>(
  producer: () => Promise<T>,
  options?: Options,
): [AsyncEffectState<T>, () => void] {
  const [result, setResult] = useState<AsyncEffectState<T>>([
    AsyncState.LOADING,
    null,
    null,
  ]);

  // When this function gets re-executed, a new producer is created which have it's own closure
  // variables. So the queued update store the last producer function so that the right closure
  // is called.
  const updateQueued = useRef<(() => Promise<T>) | null>(null);

  // If a closure is running or debuncing, queue the last update function.
  const updateRunning = useRef<number>(0);

  // Used to determine if the state should be updated due to a new request.
  const currentNonce = useRef<number>(0);

  const update = (queuedUpdate: boolean, updateProducer: () => Promise<T>) => {
    let shouldQueue = false;
    if (!options?.disableRequestDedup && !options?.debounceDelayMs) {
      shouldQueue = true;
    }

    if (updateRunning.current && shouldQueue) {
      updateQueued.current = updateProducer;
    } else {
      updateRunning.current += 1;

      const updateNonce = currentNonce.current;

      if (!options?.noLoadingOnReload) {
        setResult([AsyncState.LOADING, null, null]);
      }

      const shouldUpdateState = () => options?.updateStateOnAllCall
          || (updateNonce === currentNonce.current && updateQueued.current === null);

      let shouldDebounce = false;
      if (!queuedUpdate) {
        if (options?.debounceDelayMs) {
          if (updateRunning.current === 1) {
            shouldDebounce = options?.debounceOnInitialCall === true;
          } else {
            shouldDebounce = true;
          }
        }
      }

      const startingPromise = shouldDebounce
        ? waitPromise(options?.debounceDelayMs)
        : Promise.resolve();

      startingPromise
        .then(() => {
          if (!shouldUpdateState()) {
            return Promise.resolve();
          }
          return updateProducer()
            .then((producedData) => {
              if (shouldUpdateState()) {
                setResult([AsyncState.RESOLVED, producedData, null]);
              }
            })
            .catch((producedError) => {
              if (shouldUpdateState()) {
                setResult([AsyncState.ERROR, null, producedError]);
              }
            });
        })
        .finally(() => {
          if (updateQueued.current) {
            const queuedProducer = updateQueued.current;
            updateQueued.current = null;
            updateRunning.current -= 1;
            update(true, queuedProducer);
          } else {
            updateRunning.current -= 1;
          }
        });
    }
  };

  const trigger = () => {
    currentNonce.current += 1;
    update(false, producer);

    return () => {
      if (updateQueued.current) {
        updateQueued.current = null;
      }
    };
  };

  return [result, trigger];
}

/**
 * Utility for resolving `AsyncEffectState` to it's respective UI block.
 */
export function asyncUIBlock<T>(
  state: AsyncEffectState<any>,
  onSuccess: (data: T) => React.ReactNode,
  onError: (error: Error) => React.ReactNode,
  onLoading?: () => React.ReactNode,
): React.ReactNode | undefined {
  const [status, data, error] = state;

  if (status === AsyncState.LOADING) {
    if (onLoading !== undefined) {
      return onLoading();
    }
    return undefined;
  }

  if (status === AsyncState.ERROR) {
    return onError(error);
  }

  return onSuccess(data);
}

/**
 * Encapsulate the standard "useEffect to load async data to state" pattern. Works nearly like
 * `useEffect` but accept an async function and return the current state of the request.
 */
export function useAsyncEffectState<T>(
  producer: () => Promise<T>,
  dependencies: DependencyList,
  options?: Options,
): AsyncEffectState<T> {
  const [result, trigger] = useManualAsyncState(producer, options);

  useEffect(trigger, dependencies);

  return result;
}

/**
 * Map the input state if resolved through a mapper. The mapper should itself returns an
 * `AsyncEffectState<U>`. Note that the mapper runs conditionally, meaning it can't have React's
 * `useState` or any other use* calls including `useAsyncEffectState` which uses `useState` and
 * `useEffect` internally. It can however, return another `AsyncEffectState<U>` from it's closure.
 */
export function flatMap<T, U>(
  mapper: (input: T) => AsyncEffectState<U>,
  input: AsyncEffectState<T>,
): AsyncEffectState<U> {
  const [state, result, err] = input;
  if (state !== AsyncState.RESOLVED) {
    return input;
  }

  return mapper(result);
}

/**
 * Simple synchronous mapper for the `AsyncEffectState` which only map the result when the state is
 * resolved. Useful for transforming the data without using the async function passed in the
 * useAsyncEffectState which will probably require another http call.
 */
export function map<T, U>(
  mapper: (input: T) => U,
  input: AsyncEffectState<T>,
): AsyncEffectState<U> {
  const [state, result, err] = input;
  if (state !== AsyncState.RESOLVED) {
    return input;
  }

  return [AsyncState.RESOLVED, mapper(result), null];
}

/**
 * Synchronously combine two `AsyncEffectState` into one.
 */
export function combine<T1, T2, U>(
  combiner: (input1: T1, input2: T2) => U,
  input1: AsyncEffectState<T1>,
  input2: AsyncEffectState<T2>,
): AsyncEffectState<U> {
  const [state1, result1, err1] = input1;
  const [state2, result2, err2] = input2;

  if (state1 === AsyncState.ERROR) {
    return input1;
  }

  if (state2 === AsyncState.ERROR) {
    return input2;
  }

  if (state1 === AsyncState.LOADING) {
    return input1;
  }

  if (state2 === AsyncState.LOADING) {
    return input2;
  }

  return [AsyncState.RESOLVED, combiner(result1, result2), null];
}
