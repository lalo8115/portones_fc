-- Create marketplace_items table
CREATE TABLE IF NOT EXISTS marketplace_items (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  category TEXT NOT NULL CHECK (category IN ('electronics', 'furniture', 'vehicles', 'clothing', 'home', 'services', 'other')),
  contact_info TEXT,
  image_url TEXT,
  seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  colonia_id UUID NOT NULL REFERENCES colonias(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_marketplace_items_colonia ON marketplace_items(colonia_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_items_seller ON marketplace_items(seller_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_items_category ON marketplace_items(category);
CREATE INDEX IF NOT EXISTS idx_marketplace_items_created_at ON marketplace_items(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE marketplace_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view items from their own colonia
CREATE POLICY "Users can view marketplace items from their colonia"
  ON marketplace_items
  FOR SELECT
  USING (
    colonia_id IN (
      SELECT colonia_id 
      FROM profiles 
      WHERE id = auth.uid() AND colonia_id IS NOT NULL
    )
  );

-- Users can insert their own items if they belong to a colonia
CREATE POLICY "Users can create marketplace items in their colonia"
  ON marketplace_items
  FOR INSERT
  WITH CHECK (
    seller_id = auth.uid() AND
    colonia_id IN (
      SELECT colonia_id 
      FROM profiles 
      WHERE id = auth.uid() AND colonia_id IS NOT NULL
    )
  );

-- Users can update their own items
CREATE POLICY "Users can update their own marketplace items"
  ON marketplace_items
  FOR UPDATE
  USING (seller_id = auth.uid())
  WITH CHECK (seller_id = auth.uid());

-- Users can delete their own items
CREATE POLICY "Users can delete their own marketplace items"
  ON marketplace_items
  FOR DELETE
  USING (seller_id = auth.uid());

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_marketplace_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER marketplace_items_updated_at
  BEFORE UPDATE ON marketplace_items
  FOR EACH ROW
  EXECUTE FUNCTION update_marketplace_items_updated_at();

-- Grant permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON marketplace_items TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE marketplace_items_id_seq TO authenticated;
