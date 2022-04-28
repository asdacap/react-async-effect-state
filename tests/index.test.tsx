import {
  render, waitFor, screen, RenderResult, act,
} from '@testing-library/react';
import React from 'react';
import { asyncUIBlock, Options, useAsyncEffectState } from '../src';
import waitPromise from '../src/waitPromise';

jest.mock('../src/waitPromise', () => jest.fn());
const mockedWaitPromise = waitPromise as jest.MockedFunction<any>;

describe('useAsyncEffectState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function TestElement(props: {
    asyncFunction: () => Promise<string>,
    nonce?: number,
    options?: Options
  }): any {
    const { asyncFunction, nonce, options } = props;
    const request = useAsyncEffectState(asyncFunction, [nonce], options);

    return (
      <>
        <p>Nonce is {nonce}</p>
        {
          asyncUIBlock(
              request,
              (testString: string) => <p>{testString}</p>,
              (error) => <p>{error.toString()}</p>,
              () => <p>Loading...</p>,
          )
        }
      </>
    );
  }

  class TestFixture {
    totalCallCount = 0;

    options?: Options;

    private blocker: Promise<void>;

    private renderResult: RenderResult;

    private blockerResolver: (value?: any) => void;

    private blockerRejector: (error: Error) => void;

    constructor(optionsParam?: Options) {
      this.options = optionsParam;
      this.blocker = new Promise((resolve, reject) => {
        this.blockerResolver = resolve;
        this.blockerRejector = reject;
      });
    }

    async asyncFunction() {
      this.totalCallCount += 1;

      await this.blocker;

      this.blocker = new Promise((resolve, reject) => {
        this.blockerResolver = resolve;
        this.blockerRejector = reject;
      });

      return 'Sample string';
    }

    render(nonce: number) {
      this.renderResult = render(<TestElement
        asyncFunction={() => this.asyncFunction()}
        nonce={nonce}
        options={this.options}
      />);
    }

    rerender(nonce: number) {
      this.renderResult.rerender(<TestElement
        asyncFunction={() => this.asyncFunction()}
        nonce={nonce}
        options={this.options}
      />);
    }

    releaseResolver() {
      act(() => this.blockerResolver());
    }

    releaseRejector(err: Error) {
      act(() => this.blockerRejector(err));
    }

    async expectNonceRendered(nonce: number) {
      await waitFor(() => screen.findByText(`Nonce is ${nonce}`));
    }

    async expectTotalCallCount(callCount: number) {
      await waitFor(() => expect(this.totalCallCount).toEqual(callCount));
    }

    async expectLoadingRendered() {
      await waitFor(() => screen.findByText('Loading...'));
    }

    async expectSampleStringRendered() {
      await waitFor(() => screen.findByText('Sample string'));
    }

    async expectTextFound(text: string) {
      await waitFor(() => screen.findByText(text));
    }
  }

  describe('Default config on single render', () => {
    it('should render loading and then render resulting string', async () => {
      const test = new TestFixture();
      test.render(0);
      await test.expectLoadingRendered();
      test.releaseResolver();
      await test.expectSampleStringRendered();
    });

    it('should render loading and then render error if an error occured', async () => {
      const test = new TestFixture();
      test.render(0);
      await test.expectLoadingRendered();
      test.releaseRejector(new Error('Error'));
      await test.expectTextFound('Error: Error');
    });
  });

  describe('call dedup behaviour', () => {
    it('should remove duplicated async call if previous async call was not resolved', async () => {
      const test = new TestFixture();

      test.render(0);
      await test.expectNonceRendered(0);

      test.rerender(1);
      await test.expectNonceRendered(1);

      test.rerender(2);
      await test.expectNonceRendered(2);

      await test.expectTotalCallCount(1);

      test.releaseResolver();

      await test.expectTotalCallCount(2);
      await expect(() => test.expectTotalCallCount(3)).rejects.toThrow();
    });
  });

  describe('call dedup is disabled', () => {
    it('should call async call as many time as props update', async () => {
      const test = new TestFixture({
        disableRequestDedup: true,
      });

      test.render(0);
      await test.expectNonceRendered(0);

      test.rerender(1);
      await test.expectNonceRendered(1);

      test.rerender(2);
      await test.expectNonceRendered(2);

      await test.expectTotalCallCount(3);
    });
  });

  describe('noLoadingOnReload option', () => {
    it('should not show loading on second render', async () => {
      const test = new TestFixture({
        noLoadingOnReload: true,
      });

      test.render(0);
      await test.expectLoadingRendered();
      test.releaseResolver();
      await test.expectSampleStringRendered();
      test.rerender(1);
      await expect(() => test.expectLoadingRendered()).rejects.toThrow();
    });

    it('should show loading on second render by default', async () => {
      const test = new TestFixture();

      test.render(0);
      await test.expectLoadingRendered();
      test.releaseResolver();
      await test.expectSampleStringRendered();
      test.rerender(1);
      await test.expectLoadingRendered();
    });
  });

  describe('debounced option', () => {
    it('debounce on second render', async () => {
      const test = new TestFixture({
        debounceDelayMs: 1000,
      });

      let timerResolve;
      mockedWaitPromise.mockReturnValue(new Promise((resolve, _) => {
        timerResolve = resolve;
      }));

      test.render(0);
      await test.expectNonceRendered(0);
      expect(mockedWaitPromise.mock.calls.length).toBe(0);

      test.rerender(1);
      await test.expectNonceRendered(1);
      await test.expectTotalCallCount(1);

      act(() => {
        timerResolve();
      });
      test.releaseResolver();

      await test.expectTotalCallCount(1);

      test.rerender(2);
      await test.expectNonceRendered(2);

      expect(mockedWaitPromise.mock.calls.length).toBe(2);
      await test.expectTotalCallCount(3);
    });

    it('debounce on every render', async () => {
      const test = new TestFixture({
        debounceDelayMs: 1000,
        debounceOnInitialCall: true,
      });

      let timerResolve;
      mockedWaitPromise.mockReturnValue(new Promise((resolve, _) => {
        timerResolve = resolve;
      }));

      test.render(0);
      await test.expectNonceRendered(0);
      expect(mockedWaitPromise.mock.calls.length).toBe(1);

      test.rerender(1);
      await test.expectNonceRendered(1);

      // Blocked by timer
      await test.expectTotalCallCount(0);

      act(() => {
        timerResolve();
      });
      test.releaseResolver();

      // Blocked by timer
      await test.expectTotalCallCount(1);

      test.rerender(2);
      await test.expectNonceRendered(2);

      expect(mockedWaitPromise.mock.calls.length).toBe(3);
      await test.expectTotalCallCount(2);
    });
  });
});
