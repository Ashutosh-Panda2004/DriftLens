import { describe, it, expect } from 'vitest';
import { classifyMessage } from '../src/collector/reprompt/classifier.js';

describe('classifyMessage - corrections', () => {
  it('classifies "No, use X instead"', () => {
    expect(classifyMessage("No, use the service layer instead")).toBe('correction');
  });

  it('classifies negation + instruction', () => {
    expect(classifyMessage("Don't call fetch directly, use userService")).toBe('correction');
  });

  it('classifies "Wrong, we don\'t do that"', () => {
    expect(classifyMessage("Wrong, we don't import from ../services here")).toBe('correction');
  });

  it('classifies "Fix the import"', () => {
    expect(classifyMessage("Fix the import to use @/services")).toBe('correction');
  });

  it('classifies question-form correction', () => {
    expect(classifyMessage("Can you fix the import?")).toBe('correction');
  });

  it('classifies "use X not Y"', () => {
    expect(classifyMessage("Use authService not fetch")).toBe('correction');
  });
});

describe('classifyMessage - new requests', () => {
  it('classifies "Add a search feature"', () => {
    expect(classifyMessage("Add a search feature to the homepage")).toBe('new_request');
  });

  it('classifies "Create a new component"', () => {
    expect(classifyMessage("Create a new NotificationBell component")).toBe('new_request');
  });

  it('classifies "Implement pagination"', () => {
    expect(classifyMessage("Implement pagination for the user list")).toBe('new_request');
  });
});

describe('classifyMessage - clarifications', () => {
  it('classifies "What does this function do?"', () => {
    expect(classifyMessage("What does this function do?")).toBe('clarification');
  });

  it('classifies "Explain this code"', () => {
    expect(classifyMessage("Explain this code to me")).toBe('clarification');
  });
});

describe('classifyMessage - approvals', () => {
  it('classifies "Looks good"', () => {
    expect(classifyMessage("Looks good, ship it")).toBe('approval');
  });

  it('classifies "LGTM"', () => {
    expect(classifyMessage("lgtm")).toBe('approval');
  });

  it('classifies "Perfect"', () => {
    expect(classifyMessage("Perfect, commit this")).toBe('approval');
  });
});
