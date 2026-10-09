import { ONBOARDING_SLIDES } from '@/domains/onboarding/slides';

describe('ONBOARDING_SLIDES', () => {
  it('opens with what the app is and then covers every tab in tab-bar order', () => {
    expect(ONBOARDING_SLIDES[0].id).toBe('welcome');
    const eyebrows = ONBOARDING_SLIDES.slice(1).map((s) => s.eyebrow);
    expect(eyebrows).toEqual([
      'Profile tab',
      'Library tab',
      'Quotes tab',
      'Book Club and Recall tabs',
      'Settings tab',
    ]);
  });

  it('has exactly one premium card, and it sells on reading performance', () => {
    const premium = ONBOARDING_SLIDES.filter((s) => s.premium);
    expect(premium).toHaveLength(1);
    expect(premium[0].title).toMatch(/deeper|remember/i);
    expect(premium[0].body).toMatch(/your own notes/);
    expect(premium[0].body).toMatch(/never reads past your bookmark/);
  });

  it('keeps the free-forever promise on the first card', () => {
    expect(ONBOARDING_SLIDES[0].points.join(' ')).toMatch(/free forever/);
    expect(ONBOARDING_SLIDES[0].points.join(' ')).toMatch(/never AI-written/);
  });

  it('never quotes a price - the store owns those', () => {
    const text = ONBOARDING_SLIDES.map((s) => `${s.title} ${s.body} ${s.points.join(' ')}`).join(
      '\n',
    );
    expect(text).not.toMatch(/\$\d|USD|per month|per year/);
  });

  it('keeps every card short enough to read without scrolling', () => {
    for (const slide of ONBOARDING_SLIDES) {
      expect(slide.title.length).toBeLessThanOrEqual(45);
      expect(slide.body.length).toBeLessThanOrEqual(200);
      expect(slide.points.length).toBeGreaterThanOrEqual(2);
      expect(slide.points.length).toBeLessThanOrEqual(4);
      for (const point of slide.points) {
        expect(point.length).toBeLessThanOrEqual(90);
      }
    }
  });

  it('has unique ids', () => {
    expect(new Set(ONBOARDING_SLIDES.map((s) => s.id)).size).toBe(ONBOARDING_SLIDES.length);
  });
});
