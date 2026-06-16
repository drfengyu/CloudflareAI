/**
 * Debug script to test calculateCredits locally
 */

import { calculateCredits } from './lib/billing/pricing';

async function testCalculateCredits() {
  console.log('=== Testing calculateCredits ===\n');

  try {
    // Test 1: Text model
    console.log('Test 1: Text model (@cf/meta/llama-3.1-8b-instruct)');
    const textCredits = await calculateCredits(
      '@cf/meta/llama-3.1-8b-instruct',
      500,  // input tokens
      100,  // output tokens
    );
    console.log(`Result: ${textCredits} cr\n`);

    // Test 2: Image model
    console.log('Test 2: Image model (@cf/black-forest-labs/flux-1-schnell)');
    const imageCredits = await calculateCredits(
      '@cf/black-forest-labs/flux-1-schnell',
      0,
      0,
      undefined,
      'Text-to-Image'
    );
    console.log(`Result: ${imageCredits} cr\n`);

    // Test 3: Unknown model
    console.log('Test 3: Unknown model');
    const unknownCredits = await calculateCredits(
      '@cf/unknown/model',
      1000,
      500
    );
    console.log(`Result: ${unknownCredits} cr\n`);

  } catch (error) {
    console.error('Error:', error);
    if (error instanceof Error) {
      console.error('Stack:', error.stack);
    }
  }
}

testCalculateCredits();
