# React Async Effect State

Encapsulate setting states from async request in React. Usually on a React component that need to 
get data from an async call (eg: API call), the call is requested in a `useEffect` block, which
then set some state on various lifecycle of the call. Including some error handling, this 
would look like this:

```javascript
const [requestState, setRequestState] = useState(["loading", null, null]);
const [status, response, error] = requestState;

useEffect(() => {
    fetch('http://example.com')
        .then((data) => {
            setRequestState(["done", data, null]);
        })
        .catch((error) => {
            setRequestState(["error", null, error]);
        })
}, [])

if (status === "loading") {
    return (<p>Loading data...</p>);
}
if (status === "error") {
    return (<p>An error occured {error.toString()}</p>);
}

return (<p>{response}</p>);
```

This library reduce this to:

```javascript
import { useAsyncEffectState } from 'react-async-effect-state';

const [status, response, error] = useAsyncEffectState(
    () => fetch('http://example.com'), []);

if (status === AsyncState.LOADING) {
    return (<p>Loading data...</p>);
}
if (status === AsyncState.ERROR) {
    return (<p>An error occured {error.toString()}</p>);
}

return (<p>{response}</p>);
```

or if you prefer:

```javascript
import { useAsyncEffectState, asyncUIBlock } from 'react-async-effect-state';

const responseAsync = useAsyncEffectState(
    () => fetch('http://example.com'), []);

return asyncUIBlock(responseAsync,
    (response) => (<p>{response}</p>),
    (error) => (<p>An error occured {error.toString()}</p>),
    () => (<p>Loading data...</p>)
);
```

## Usage

### `useAsyncEffectState(closure, dependencyList, options)`

Encapsulate setting states from async request. The third parameter is an option object that can
alter some behaviour. Returns a tuple of type `[status,response,error]` which is the current state
of the request.

```typescript
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
     * By default, debounce start on additional call when a current call is running. This is to improve
     * user feedback in case only one request is required. Set this to true to delay even the first
     * call.
     */
    debounceOnInitialCall?: boolean;
}
```

### `asyncUIBlock([status, response, error], onResolve, onReject, onLoading)` 

A small syntactical sugar that runs one of the three closure and returns its response 
depending on the current request state.

### License

MIT © Muhammad Amirul Ashraf