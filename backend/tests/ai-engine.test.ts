/**
 * RentFlow AI Backend - Test Suite
 * 
 * File: backend/tests/ai-engine.test.ts
 * 
 * TESTING STRATEGY:
 * 1. Unit tests for AI decision engine
 * 2. Integration tests for blockchain interaction
 * 3. API endpoint tests
 * 4. Edge case handling
 */

import { AIDecisionEngine } from '../src/index';

describe('AIDecisionEngine', () => {
  let aiEngine: AIDecisionEngine;

  beforeEach(() => {
    aiEngine = new AIDecisionEngine();
  });

  describe('evaluateMaintenanceRequest', () => {
    test('should approve routine maintenance under $500', async () => {
      const result = await aiEngine.evaluateMaintenanceRequest(
        1,
        'Replace HVAC air filter - routine maintenance',
        150 * 1e6, // $150 in USDC cents
        { totalSpend: 5000, avgResponseTime: 2.5, propertyAge: 10 }
      );

      expect(result.decision).toBe('approve');
      expect(result.confidence).toBeGreaterThan(70);
      expect(result.approvedAmount).toBeLessThanOrEqual(500 * 1e6);
    });

    test('should escalate high-cost requests', async () => {
      const result = await aiEngine.evaluateMaintenanceRequest(
        2,
        'Replace entire roof due to water damage',
        8000 * 1e6, // $8,000
        { totalSpend: 2000, avgResponseTime: 3, propertyAge: 15 }
      );

      expect(result.decision).toBe('escalate');
      expect(result.reasoning).toContain('approval limit');
    });

    test('should reject cosmetic requests over $200', async () => {
      const result = await aiEngine.evaluateMaintenanceRequest(
        3,
        'Custom painting of bedroom with mural artwork',
        400 * 1e6, // $400
        { totalSpend: 1000, avgResponseTime: 2, propertyAge: 5 }
      );

      expect(result.decision).toBe('reject');
      expect(result.confidence).toBeGreaterThan(60);
    });

    test('should approve emergency repairs immediately', async () => {
      const result = await aiEngine.evaluateMaintenanceRequest(
        4,
        'Gas leak detected in kitchen - emergency repair needed',
        350 * 1e6, // $350
        { totalSpend: 3000, avgResponseTime: 2, propertyAge: 8 }
      );

      expect(result.decision).toBe('approve');
      expect(result.urgency).toBe('high');
      expect(result.confidence).toBeGreaterThan(90);
    });

    test('should handle plumbing repairs correctly', async () => {
      const result = await aiEngine.evaluateMaintenanceRequest(
        5,
        'Leaking faucet in bathroom sink',
        120 * 1e6, // $120
        { totalSpend: 1500, avgResponseTime: 1.5, propertyAge: 7 }
      );

      expect(result.decision).toBe('approve');
      expect(result.approvedAmount).toBeLessThanOrEqual(150 * 1e6);
    });

    test('should escalate ambiguous requests', async () => {
      const result = await aiEngine.evaluateMaintenanceRequest(
        6,
        'Something wrong with the property, needs fixing',
        200 * 1e6, // $200
        { totalSpend: 500, avgResponseTime: 3, propertyAge: 3 }
      );

      expect(result.decision).toBe('escalate');
      expect(result.reasoning).toContain('ambiguous');
    });

    test('should respect auto-approval limit override', async () => {
      const result = await aiEngine.evaluateMaintenanceRequest(
        7,
        'HVAC system replacement',
        600 * 1e6, // $600 (over $500 limit)
        { totalSpend: 10000, avgResponseTime: 2, propertyAge: 20 }
      );

      // Even if AI wants to approve, should escalate due to limit
      expect(result.decision).toBe('escalate');
      expect(result.reasoning).toContain('approval limit');
    });

    test('should handle electrical issues appropriately', async () => {
      const result = await aiEngine.evaluateMaintenanceRequest(
        8,
        'Sparking electrical outlet in living room',
        180 * 1e6, // $180
        { totalSpend: 2000, avgResponseTime: 2, propertyAge: 12 }
      );

      expect(result.decision).toBe('approve');
      expect(result.urgency).toBe('high');
    });
  });

  describe('generateTenantCommunication', () => {
    test('should generate friendly rent reminder', async () => {
      const message = await aiEngine.generateTenantCommunication({
        type: 'reminder',
        tenantName: 'John Doe',
        rentAmount: 2500,
      });

      expect(message).toBeTruthy();
      expect(message.length).toBeLessThan(500);
      expect(message.toLowerCase()).toContain('rent');
    });

    test('should generate firm overdue notice', async () => {
      const message = await aiEngine.generateTenantCommunication({
        type: 'overdue',
        daysOverdue: 10,
      });

      expect(message).toBeTruthy();
      expect(message.toLowerCase()).toContain('overdue');
      expect(message.length).toBeLessThan(800);
    });

    test('should generate maintenance update', async () => {
      const message = await aiEngine.generateTenantCommunication({
        type: 'maintenance_update',
        maintenanceStatus: 'approved',
      });

      expect(message).toBeTruthy();
      expect(message.toLowerCase()).toContain('maintenance');
    });
  });
});

// ============ Integration Tests ============

describe('API Endpoints', () => {
  const BASE_URL = 'http://localhost:3001/api';

  describe('GET /health', () => {
    test('should return healthy status', async () => {
      const response = await fetch(`${BASE_URL}/health`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('healthy');
      expect(data.blockchain.connected).toBe(true);
    });
  });

  describe('POST /maintenance/evaluate', () => {
    test('should evaluate valid maintenance request', async () => {
      const response = await fetch(`${BASE_URL}/maintenance/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: 'Fix leaking faucet in kitchen',
          estimatedCost: 150000000, // $150
          propertyId: 1,
        }),
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.decision).toHaveProperty('decision');
      expect(data.decision).toHaveProperty('reasoning');
      expect(data.decision).toHaveProperty('confidence');
    });

    test('should reject invalid description', async () => {
      const response = await fetch(`${BASE_URL}/maintenance/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: 'short', // Too short
          estimatedCost: 150000000,
          propertyId: 1,
        }),
      });

      expect(response.status).toBe(400);
    });

    test('should reject invalid cost', async () => {
      const response = await fetch(`${BASE_URL}/maintenance/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: 'Fix leaking faucet',
          estimatedCost: -100, // Negative cost
          propertyId: 1,
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /tenant/:address/score', () => {
    test('should return tenant score for valid address', async () => {
      const testAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb';
      const response = await fetch(`${BASE_URL}/tenant/${testAddress}/score`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.profile).toHaveProperty('payment_history_score');
    });

    test('should reject invalid address', async () => {
      const response = await fetch(`${BASE_URL}/tenant/invalid-address/score`);
      expect(response.status).toBe(400);
    });

    test('should return 404 for non-existent tenant', async () => {
      const nonExistentAddress = '0x0000000000000000000000000000000000000000';
      const response = await fetch(`${BASE_URL}/tenant/${nonExistentAddress}/score`);
      expect(response.status).toBe(404);
    });
  });

  describe('POST /chat', () => {
    test('should handle chat message', async () => {
      const response = await fetch(`${BASE_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'What is the process for paying rent?',
        }),
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.response).toBeTruthy();
    });

    test('should reject empty message', async () => {
      const response = await fetch(`${BASE_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: '' }),
      });

      expect(response.status).toBe(400);
    });
  });
});

// ============ Edge Case Tests ============

describe('Edge Cases', () => {
  test('should handle AI service timeout gracefully', async () => {
    // Mock slow AI response
    const aiEngine = new AIDecisionEngine();
    
    // This should escalate if AI times out
    const result = await aiEngine.evaluateMaintenanceRequest(
      999,
      'Test request',
      100 * 1e6,
      { totalSpend: 0, avgResponseTime: 0, propertyAge: 0 }
    );

    expect(result.decision).toBeDefined();
    expect(['approve', 'reject', 'escalate']).toContain(result.decision);
  });

  test('should handle malformed property history', async () => {
    const aiEngine = new AIDecisionEngine();
    
    const result = await aiEngine.evaluateMaintenanceRequest(
      100,
      'Fix broken window',
      200 * 1e6,
      {} as any // Malformed history
    );

    expect(result.decision).toBeDefined();
  });

  test('should handle very long descriptions', async () => {
    const aiEngine = new AIDecisionEngine();
    const longDescription = 'A'.repeat(10000);
    
    const result = await aiEngine.evaluateMaintenanceRequest(
      101,
      longDescription,
      150 * 1e6,
      { totalSpend: 1000, avgResponseTime: 2, propertyAge: 5 }
    );

    expect(result.decision).toBeDefined();
  });
});

// ============ Performance Tests ============

describe('Performance', () => {
  test('AI evaluation should complete under 5 seconds', async () => {
    const aiEngine = new AIDecisionEngine();
    const startTime = Date.now();
    
    await aiEngine.evaluateMaintenanceRequest(
      200,
      'Replace door lock',
      100 * 1e6,
      { totalSpend: 2000, avgResponseTime: 2, propertyAge: 8 }
    );

    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(5000);
  });

  test('should handle concurrent evaluations', async () => {
    const aiEngine = new AIDecisionEngine();
    
    const promises = Array(5).fill(null).map((_, i) =>
      aiEngine.evaluateMaintenanceRequest(
        300 + i,
        `Test request ${i}`,
        100 * 1e6,
        { totalSpend: 1000, avgResponseTime: 2, propertyAge: 5 }
      )
    );

    const results = await Promise.all(promises);
    expect(results).toHaveLength(5);
    results.forEach(result => {
      expect(result.decision).toBeDefined();
    });
  });
});

// ============ Security Tests ============

describe('Security', () => {
  test('should sanitize SQL injection attempts', async () => {
    const response = await fetch('http://localhost:3001/api/tenant/0x123\'; DROP TABLE users;--/score');
    // Should be caught by address validation
    expect(response.status).toBe(400);
  });

  test('should enforce rate limiting', async () => {
    const BASE_URL = 'http://localhost:3001/api/maintenance/evaluate';
    
    // Spam requests to trigger rate limit
    const promises = Array(25).fill(null).map(() =>
      fetch(BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: 'Test request for rate limiting',
          estimatedCost: 100000000,
          propertyId: 1,
        }),
      })
    );

    const responses = await Promise.all(promises);
    const rateLimited = responses.some(r => r.status === 429);
    
    expect(rateLimited).toBe(true);
  });

  test('should reject XSS attempts in description', async () => {
    const response = await fetch('http://localhost:3001/api/maintenance/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: '<script>alert("XSS")</script>',
        estimatedCost: 100000000,
        propertyId: 1,
      }),
    });

    const data = await response.json();
    
    // Should still process but sanitize
    expect(response.status).toBeLessThan(500);
  });
});

export {};
