import { dictationOffered, dictationStartOptions } from '../recognition';

describe('dictationOffered', () => {
  it('needs the recognizer on every platform', () => {
    expect(dictationOffered('ios', { available: false, onDevice: true })).toBe(false);
    expect(dictationOffered('android', { available: false, onDevice: null })).toBe(false);
  });

  it('on iOS insists on on-device recognition so audio never leaves the phone', () => {
    expect(dictationOffered('ios', { available: true, onDevice: true })).toBe(true);
    expect(dictationOffered('ios', { available: true, onDevice: false })).toBe(false);
    expect(dictationOffered('ios', { available: true, onDevice: null })).toBe(false);
  });

  it('keeps the existing Android rule', () => {
    expect(dictationOffered('android', { available: true, onDevice: null })).toBe(true);
    expect(dictationOffered('android', { available: true, onDevice: false })).toBe(true);
  });
});

describe('dictationStartOptions', () => {
  it('pins iOS sessions to the device and asks for dictation-style punctuation', () => {
    expect(dictationStartOptions('ios')).toEqual({
      interimResults: true,
      continuous: true,
      requiresOnDeviceRecognition: true,
      addsPunctuation: true,
      iosTaskHint: 'dictation',
    });
  });

  it('leaves Android sessions as they were', () => {
    expect(dictationStartOptions('android')).toEqual({ interimResults: true, continuous: true });
  });
});
