-- Notification system tables

-- Notification preferences table
CREATE TABLE notification_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email_enabled BOOLEAN DEFAULT true,
    sms_enabled BOOLEAN DEFAULT false,
    webhook_enabled BOOLEAN DEFAULT false,
    in_app_enabled BOOLEAN DEFAULT true,
    quiet_hours_start TIME, -- HH:MM format
    quiet_hours_end TIME, -- HH:MM format
    frequency_limit INTEGER DEFAULT 10 CHECK (frequency_limit > 0), -- Max notifications per hour
    email_address VARCHAR(255),
    phone_number VARCHAR(20),
    webhook_url VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Notification templates table
CREATE TABLE notification_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('email', 'sms', 'webhook', 'in_app')),
    subject VARCHAR(255),
    body TEXT NOT NULL,
    variables TEXT[], -- Array of template variables
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(name, type)
);

-- Notification deliveries table
CREATE TABLE notification_deliveries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alert_id UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'sms', 'webhook', 'in_app')),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'bounced')),
    recipient VARCHAR(500) NOT NULL,
    subject VARCHAR(255),
    content TEXT NOT NULL,
    error_message TEXT,
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- In-app notifications table
CREATE TABLE in_app_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    alert_id UUID REFERENCES alerts(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_notification_preferences_user_id ON notification_preferences(user_id);
CREATE INDEX idx_notification_templates_type ON notification_templates(type);
CREATE INDEX idx_notification_templates_name ON notification_templates(name);
CREATE INDEX idx_notification_deliveries_alert_id ON notification_deliveries(alert_id);
CREATE INDEX idx_notification_deliveries_user_id ON notification_deliveries(user_id);
CREATE INDEX idx_notification_deliveries_channel ON notification_deliveries(channel);
CREATE INDEX idx_notification_deliveries_status ON notification_deliveries(status);
CREATE INDEX idx_notification_deliveries_created_at ON notification_deliveries(created_at);
CREATE INDEX idx_in_app_notifications_user_id ON in_app_notifications(user_id);
CREATE INDEX idx_in_app_notifications_is_read ON in_app_notifications(is_read);
CREATE INDEX idx_in_app_notifications_created_at ON in_app_notifications(created_at);

-- Add updated_at triggers
CREATE TRIGGER update_notification_preferences_updated_at 
    BEFORE UPDATE ON notification_preferences 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_templates_updated_at 
    BEFORE UPDATE ON notification_templates 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default notification templates
INSERT INTO notification_templates (name, type, subject, body, variables) VALUES
('alert_low', 'email', 'Low Priority Alert: {{title}}', 
 '<h2>{{title}}</h2>
  <p><strong>Severity:</strong> {{severity}}</p>
  <p><strong>Brand:</strong> {{brand_name}}</p>
  <p><strong>Message:</strong></p>
  <div>{{message}}</div>
  <p><strong>Time:</strong> {{created_at}}</p>
  <hr>
  <p><small>This is an automated alert from your Brand Monitoring System.</small></p>',
 ARRAY['severity', 'title', 'brand_name', 'message', 'created_at']),

('alert_medium', 'email', 'Medium Priority Alert: {{title}}', 
 '<h2 style="color: #ff9800;">{{title}}</h2>
  <p><strong>Severity:</strong> <span style="color: #ff9800;">{{severity}}</span></p>
  <p><strong>Brand:</strong> {{brand_name}}</p>
  <p><strong>Message:</strong></p>
  <div>{{message}}</div>
  <p><strong>Time:</strong> {{created_at}}</p>
  <hr>
  <p><small>This is an automated alert from your Brand Monitoring System.</small></p>',
 ARRAY['severity', 'title', 'brand_name', 'message', 'created_at']),

('alert_high', 'email', 'High Priority Alert: {{title}}', 
 '<h2 style="color: #f44336;">{{title}}</h2>
  <p><strong>Severity:</strong> <span style="color: #f44336;">{{severity}}</span></p>
  <p><strong>Brand:</strong> {{brand_name}}</p>
  <p><strong>Message:</strong></p>
  <div>{{message}}</div>
  <p><strong>Time:</strong> {{created_at}}</p>
  <hr>
  <p><small>This is an automated alert from your Brand Monitoring System. Please take immediate action.</small></p>',
 ARRAY['severity', 'title', 'brand_name', 'message', 'created_at']),

('alert_critical', 'email', 'CRITICAL Alert: {{title}}', 
 '<h2 style="color: #d32f2f; background-color: #ffebee; padding: 10px;">{{title}}</h2>
  <p><strong>Severity:</strong> <span style="color: #d32f2f; font-weight: bold;">{{severity}}</span></p>
  <p><strong>Brand:</strong> {{brand_name}}</p>
  <p><strong>Message:</strong></p>
  <div style="background-color: #ffebee; padding: 10px; border-left: 4px solid #d32f2f;">{{message}}</div>
  <p><strong>Time:</strong> {{created_at}}</p>
  <hr>
  <p><small>This is a CRITICAL automated alert from your Brand Monitoring System. Immediate action required!</small></p>',
 ARRAY['severity', 'title', 'brand_name', 'message', 'created_at']);